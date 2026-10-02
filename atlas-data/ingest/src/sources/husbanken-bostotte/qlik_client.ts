/**
 * Minimal client for Husbanken's Qlik Sense "Statistikkbank" app, over the
 * Qlik Engine API (WebSocket JSON-RPC 2.0) — Atlas's FIRST WebSocket-based
 * ingest mechanism, every prior source being a plain HTTP GET.
 *
 * This is NOT a reverse-engineered protocol the way IMDikator would have
 * been (see `INVESTIGATE-imdikator-api.md`) — the Qlik Engine API is
 * officially documented by Qlik, and Qlik publishes its own open-source
 * client (`enigma.js`). This file is a small, dependency-free subset
 * written directly against the raw protocol rather than pulling in
 * `enigma.js`, because the only operations this ingest needs — open a doc,
 * create one hypercube, page through its rows, close — are a handful of
 * JSON-RPC calls, confirmed live during Phase 1/2 research.
 *
 * ⚠️ Confirmed live: a full `qHeight`-in-one-page fetch over the whole
 * dataset (7,449 rows × 7 columns) fails with Qlik's own `qErrorCode: 7009`
 * (hypercube too large for one request). `fetchAllRows` below paginates in
 * fixed-size batches via `GetHyperCubeData` instead — budget for this if a
 * future Qlik-backed source's dataset is large; a single `GetLayout` call
 * silently returning `qDataPages: []` with a `qError` is the symptom.
 *
 * ⚠️ The app is anonymously reachable (`mustAuthenticate:false`, confirmed
 * live) on the public virtual proxy — no credential handling here. If a
 * future Qlik-backed source needs an authenticated session, this file is
 * not a template for that.
 *
 * Per this project's established convention (`fetch_retry.ts` is copied,
 * not shared, across sources) — copy this file for a future Qlik-backed
 * source rather than importing it from here.
 */

export type QlikHypercubeDef = {
  qDimensions: { qDef: { qFieldDefs: string[] } }[];
  qMeasures: { qDef: { qDef: string; qLabel: string } }[];
};

type JsonRpcMessage = {
  id?: number;
  jsonrpc: "2.0";
  method?: string;
  result?: unknown;
  error?: { message: string; code: number };
};

export class QlikSession {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private closed = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as JsonRpcMessage;
      if (msg.id === undefined) return; // server push (e.g. OnAuthenticationInformation) — not awaited
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else waiter.resolve(msg.result);
    };
    this.ws.onclose = () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error("WebSocket closed with a call still pending"));
      this.pending.clear();
    };
  }

  /** Connect and wait for the initial handshake push before returning. */
  static async connect(wsUrl: string, timeoutMs = 10_000): Promise<QlikSession> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WebSocket connect timed out: ${wsUrl}`)), timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket connect failed: ${wsUrl}`));
      };
    });
    // The server pushes OnAuthenticationInformation immediately on open;
    // give it a moment to arrive before issuing the first real call.
    await new Promise((r) => setTimeout(r, 300));
    return new QlikSession(ws);
  }

  call<T = unknown>(method: string, handle: number, params: Record<string, unknown>): Promise<T> {
    if (this.closed) return Promise.reject(new Error(`call(${method}) after WebSocket close`));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, handle, params }));
    });
  }

  close(): void {
    if (!this.closed) this.ws.close();
  }
}

export type OpenAppResult = { session: QlikSession; docHandle: number };

export async function openApp(wsUrl: string, appId: string): Promise<OpenAppResult> {
  const session = await QlikSession.connect(wsUrl);
  const openDoc = await session.call<{ qReturn: { qHandle: number } }>("OpenDoc", -1, { qDocName: appId });
  return { session, docHandle: openDoc.qReturn.qHandle };
}

export type HypercubeLayout = {
  qLayout: {
    qHyperCube: {
      qSize: { qcx: number; qcy: number };
      qError?: { qErrorCode: number };
      qMeasureInfo: { qFallbackTitle: string }[];
      qDataPages: { qMatrix: { qText: string; qNum: number | string }[][] }[];
    };
  };
};

/**
 * Create a session hypercube object and fetch every row via paginated
 * `GetHyperCubeData` calls. `pageHeight` defaults to 1000 — confirmed live
 * to stay well under Qlik's per-request cell limit for this hypercube's
 * width (7 columns); a wider hypercube on a future source should lower this.
 */
export async function fetchHypercubeAllRows(
  session: QlikSession,
  docHandle: number,
  hyperCubeDef: QlikHypercubeDef,
  pageHeight = 1000,
): Promise<{
  measureNames: string[];
  dataPages: HypercubeLayout["qLayout"]["qHyperCube"]["qDataPages"];
}> {
  const width = hyperCubeDef.qDimensions.length + hyperCubeDef.qMeasures.length;

  const created = await session.call<{ qReturn: { qHandle: number } }>("CreateSessionObject", docHandle, {
    qProp: {
      qInfo: { qType: "atlas-ingest-hypercube" },
      qHyperCubeDef: {
        ...hyperCubeDef,
        qInterColumnSortOrder: hyperCubeDef.qDimensions.map((_, i) => i),
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qHeight: pageHeight, qWidth: width }],
      },
    },
  });
  const objHandle = created.qReturn.qHandle;

  const layout = await session.call<HypercubeLayout>("GetLayout", objHandle, {});
  const hc = layout.qLayout.qHyperCube;
  if (hc.qError) {
    throw new Error(
      `GetLayout returned qErrorCode ${hc.qError.qErrorCode} — the hypercube is likely too large for one page; lower pageHeight.`,
    );
  }
  const measureNames = hc.qMeasureInfo.map((m) => m.qFallbackTitle);

  const dataPages = [...hc.qDataPages];
  let top = pageHeight;
  while (top < hc.qSize.qcy) {
    const height = Math.min(pageHeight, hc.qSize.qcy - top);
    const page = await session.call<{ qDataPages: HypercubeLayout["qLayout"]["qHyperCube"]["qDataPages"] }>(
      "GetHyperCubeData",
      objHandle,
      { qPath: "/qHyperCubeDef", qPages: [{ qTop: top, qLeft: 0, qHeight: height, qWidth: width }] },
    );
    dataPages.push(...page.qDataPages);
    top += pageHeight;
  }

  return { measureNames, dataPages };
}
