import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNgoOverview, REDCROSS_ORGNR } from "@/lib/supply";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Røde Kors — Atlas",
  description: "Oversikt over Røde Kors' lokallag og aktiviteter i Atlas.",
};

export default async function RedCrossOverviewPage() {
  const overview = await getNgoOverview(REDCROSS_ORGNR);
  if (!overview) notFound();
  const { ngo, chapter_count, regional_count, activity_count, kommune_count } =
    overview;
  const display = ngo.brand_name ?? ngo.name;

  const stats = [
    { label: "lokallag totalt", value: chapter_count },
    { label: "distrikter", value: regional_count },
    { label: "aktivitetstyper", value: activity_count },
    { label: "kommuner med tilbud", value: kommune_count },
  ];

  const sections = [
    {
      href: "/ngo/redcross/chapters",
      title: "Lokallag",
      description: "Alle lokallag, filtrerbar tabell",
    },
    {
      href: "/ngo/redcross/distrikter",
      title: "Distrikter",
      description: "De 19 distriktene og lokallagene de organiserer",
    },
    {
      href: "/ngo/redcross/aktiviteter",
      title: "Aktivitetskatalog",
      description: "Aktiviteter Røde Kors tilbyr, koblet til Atlas-kategorier",
    },
    {
      href: "/kommuner/0301",
      title: "Se per kommune",
      description: "Kommune-detaljvisning (eksempel: Oslo)",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/ngo" className="underline-offset-2 hover:underline">
            ← Alle organisasjoner
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{display}</h1>
          {ngo.primary_focus && (
            <Badge variant="secondary">{ngo.primary_focus}</Badge>
          )}
          <Badge variant="outline">Tier {ngo.tier}</Badge>
        </div>
        {ngo.brand_name && ngo.brand_name !== ngo.name && (
          <p className="mt-1 text-sm text-muted-foreground">{ngo.name}</p>
        )}
        {ngo.website_url && (
          <p className="mt-3 text-sm">
            <a
              href={ngo.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Besøk {new URL(ngo.website_url).host} ↗
            </a>
          </p>
        )}
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold tabular-nums">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">{s.title} →</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
