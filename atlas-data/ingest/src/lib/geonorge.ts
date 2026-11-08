/**
 * Geonorge's order-based "nedlasting" (download) API.
 *
 * There is no single documented static-file URL for a Geonorge dataset —
 * discovered end to end against the real API for kartverket-postnummeromrade
 * (urb-agents #2098/#2099, R3) and reused here for kartverket-kommune and
 * kartverket-fylke (R4), the first two real consumers of this shared helper.
 *
 * Flow: POST an order naming the dataset's metadata UUID, area, format and
 * projection; for every dataset tried so far the response comes back
 * synchronously (`status: "ReadyForDownload"`, no email wait) with a
 * one-time download URL for a ZIP.
 */

const ORDER_URL = "https://nedlasting.geonorge.no/api/order";

export type GeonorgeOrderResponse = {
  files: { downloadUrl: string; name: string }[];
};

export async function placeGeonorgeOrder(opts: {
  metadataUuid: string;
  areaCode: string;
  areaName: string;
  areaType: string;
  formatName: string;
  projectionCode: string;
  projectionName: string;
  projectionCodespace: string;
}): Promise<GeonorgeOrderResponse> {
  const res = await fetch(ORDER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "",
      orderLines: [
        {
          metadataUuid: opts.metadataUuid,
          areas: [{ code: opts.areaCode, name: opts.areaName, type: opts.areaType }],
          formats: [{ name: opts.formatName }],
          projections: [
            {
              code: opts.projectionCode,
              name: opts.projectionName,
              codespace: opts.projectionCodespace,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Geonorge order failed HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GeonorgeOrderResponse;
}

export async function downloadGeonorgeZip(downloadUrl: string): Promise<Buffer> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Geonorge download failed HTTP ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
