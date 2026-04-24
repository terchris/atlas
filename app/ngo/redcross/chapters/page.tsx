import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listChapters,
  listServiceCategories,
  listFylker,
  REDCROSS_ORGNR,
} from "@/lib/supply";
import type { ChapterLevel } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Røde Kors lokallag — Atlas",
};

const LEVELS: ChapterLevel[] = ["national", "regional", "local"];

type Search = Promise<{
  q?: string;
  kommune_nr?: string;
  fylke_nr?: string;
  chapter_level?: string;
  service_category_code?: string;
  show_inactive?: string;
}>;

function pickLevel(v: string | undefined): ChapterLevel | undefined {
  return LEVELS.includes(v as ChapterLevel) ? (v as ChapterLevel) : undefined;
}

export default async function RedCrossChaptersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const isActive = sp.show_inactive === "1" ? false : true;
  const filters = {
    ngo_orgnr: REDCROSS_ORGNR,
    q: sp.q?.trim() || undefined,
    kommune_nr: sp.kommune_nr?.trim() || undefined,
    fylke_nr: sp.fylke_nr || undefined,
    chapter_level: pickLevel(sp.chapter_level),
    service_category_code: sp.service_category_code || undefined,
    is_active: isActive,
  };

  const [rows, fylker, categories] = await Promise.all([
    listChapters(filters),
    listFylker(),
    listServiceCategories(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/ngo/redcross" className="underline-offset-2 hover:underline">
            ← Røde Kors
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Lokallag</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Filtrer for å snevre inn. Filtre lagres i URL — del lenken.
        </p>
      </header>

      {/* Filter form */}
      <form method="get" className="mb-6 grid gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Søk i navn</Label>
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="f.eks. Modum" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fylke_nr">Fylke</Label>
          <select
            id="fylke_nr"
            name="fylke_nr"
            defaultValue={sp.fylke_nr ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle fylker</option>
            {fylker.map((f) => (
              <option key={f.fylke_nr} value={f.fylke_nr}>
                {f.fylke_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kommune_nr">Kommune-nr (4 siffer)</Label>
          <Input
            id="kommune_nr"
            name="kommune_nr"
            defaultValue={sp.kommune_nr ?? ""}
            placeholder="0301"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chapter_level">Nivå</Label>
          <select
            id="chapter_level"
            name="chapter_level"
            defaultValue={sp.chapter_level ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle nivåer</option>
            <option value="national">Nasjonalt</option>
            <option value="regional">Distrikt</option>
            <option value="local">Lokallag</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service_category_code">Aktivitet (Atlas-kategori)</Label>
          <select
            id="service_category_code"
            name="service_category_code"
            defaultValue={sp.service_category_code ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Alle aktiviteter</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label_no}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="opacity-0 select-none" aria-hidden>
            placeholder
          </Label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="show_inactive"
              value="1"
              defaultChecked={sp.show_inactive === "1"}
              className="h-4 w-4 rounded border-input"
            />
            Vis også inaktive lokallag
          </label>
        </div>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit">Bruk filtre</Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/ngo/redcross/chapters">Tilbakestill</Link>
          </Button>
        </div>
      </form>

      <p className="mb-3 text-sm text-muted-foreground">
        {rows.length} lokallag vist
        {filters.q || filters.kommune_nr || filters.fylke_nr || filters.chapter_level || filters.service_category_code
          ? " (filtrert)"
          : ""}
        .
      </p>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Ingen lokallag matcher filtrene.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>Nivå</TableHead>
                <TableHead>Kommune</TableHead>
                <TableHead>Fylke</TableHead>
                <TableHead>Forelder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.chapter_id}>
                  <TableCell>
                    <Link
                      href={`/ngo/redcross/chapters/${r.chapter_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {!r.is_active && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        inaktiv
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {r.chapter_level === "national"
                        ? "nasjonalt"
                        : r.chapter_level === "regional"
                          ? "distrikt"
                          : "lokallag"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.kommune_name ? (
                      <Link
                        href={`/kommuner/${r.kommune_nr}`}
                        className="hover:underline"
                      >
                        {r.kommune_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{r.fylke_name ?? "—"}</TableCell>
                  <TableCell>
                    {r.parent_chapter_id && r.parent_name ? (
                      <Link
                        href={`/ngo/redcross/chapters/${r.parent_chapter_id}`}
                        className="hover:underline"
                      >
                        {r.parent_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
