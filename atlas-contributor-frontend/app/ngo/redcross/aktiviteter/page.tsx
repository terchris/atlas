import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listActivities, REDCROSS_ORGNR } from "@/lib/supply";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Røde Kors — aktivitetskatalog — Atlas",
};

export default async function RedCrossActivitiesPage() {
  const activities = await listActivities(REDCROSS_ORGNR);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/ngo/redcross" className="underline-offset-2 hover:underline">
            ← Røde Kors
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Aktivitetskatalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktivitetstyper Røde Kors registrerer per lokallag, koblet til Atlas
          sin tverrgående kategori. Tverrgående søk på tvers av organisasjoner
          kommer i en senere versjon.
        </p>
      </header>

      <p className="mb-3 text-sm text-muted-foreground">
        {activities.length} aktivitetstyper.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Røde Kors-navn</TableHead>
              <TableHead>Atlas-kategori</TableHead>
              <TableHead className="text-right">Lokallag som tilbyr</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a) => (
              <TableRow key={a.activity_id}>
                <TableCell>{a.canonical_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {a.service_category_label_no}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.chapter_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
