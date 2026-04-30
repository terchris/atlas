import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDistrikter, REDCROSS_ORGNR } from "@/lib/supply";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Røde Kors — distrikter — Atlas",
};

export default async function RedCrossDistrikterPage() {
  const distrikter = await listDistrikter(REDCROSS_ORGNR);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/ngo/redcross" className="underline-offset-2 hover:underline">
            ← Røde Kors
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Distrikter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          De {distrikter.length} distriktene Røde Kors organiserer lokallagene
          gjennom. Distriktsgrenser følger ikke alltid SSB-fylker.
        </p>
      </header>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Distrikt</TableHead>
              <TableHead>Distriktskontor (kommune)</TableHead>
              <TableHead className="text-right">Aktive lokallag</TableHead>
              <TableHead className="text-right">Kommuner dekket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {distrikter.map((d) => (
              <TableRow key={d.chapter_id}>
                <TableCell>
                  <Link
                    href={`/ngo/redcross/distrikt/${d.chapter_id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell>{d.kommune_name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.child_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.kommune_coverage_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
