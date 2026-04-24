import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNgoBySlug, countActiveChapters } from "@/lib/supply";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const ngo = await getNgoBySlug(slug);
  if (!ngo) return { title: "Ukjent organisasjon — Atlas" };
  return {
    title: `${ngo.brand_name ?? ngo.name} — Atlas`,
  };
}

export default async function NgoStubPage({ params }: { params: Params }) {
  const { slug } = await params;
  const ngo = await getNgoBySlug(slug);
  if (!ngo) notFound();

  const chapterCount = await countActiveChapters(ngo.orgnr);

  // If supply data exists for this NGO, the per-NGO route should be the
  // landing page (e.g. /ngo/redcross). The static route /ngo/redcross/page.tsx
  // takes precedence over this catch-all, so reaching here means either:
  //  (a) NGO has no supply ingest yet → render the stub below
  //  (b) NGO has supply but no dedicated landing page yet → still render stub,
  //      but mention that import is done
  const hasIngest = chapterCount > 0;
  const display = ngo.brand_name ?? ngo.name;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
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
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {hasIngest ? "Tilbud importert" : "Tilbud-data er ikke importert ennå"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {hasIngest ? (
            <p>
              Atlas har importert {chapterCount} aktive lokallag for {display},
              men en dedikert landingsside er ikke bygd ennå.
            </p>
          ) : (
            <p>
              Atlas har ikke ennå importert tilbudsdata for {display}. Vi
              jobber oss gjennom organisasjonene én etter én.
            </p>
          )}
          {ngo.website_url && (
            <p>
              I mellomtiden:{" "}
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
          <p className="text-muted-foreground">
            Følg arbeidet på{" "}
            <a
              href="https://github.com/terchris/atlas"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              GitHub ↗
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
