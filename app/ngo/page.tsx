import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listNgos } from "@/lib/supply";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Organisasjoner — Atlas",
  description: "Atlas følger 11 norske frivillige organisasjoner.",
};

export default async function NgoIndexPage() {
  const ngos = await listNgos();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-2 hover:underline">
            ← Tilbake
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Organisasjoner i Atlas</h1>
        <p className="mt-2 text-muted-foreground">
          Atlas følger 11 norske frivillige organisasjoner. Trykk på en for å
          se hva de tilbyr.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ngos.map((ngo) => {
          const display = ngo.brand_name ?? ngo.name;
          return (
            <Link key={ngo.orgnr} href={`/ngo/${ngo.slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardHeader>
                  <CardTitle className="text-lg">{display}</CardTitle>
                  {ngo.brand_name && ngo.brand_name !== ngo.name && (
                    <p className="text-xs text-muted-foreground">{ngo.name}</p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {ngo.primary_focus && (
                      <Badge variant="secondary">{ngo.primary_focus}</Badge>
                    )}
                    <Badge variant="outline">Tier {ngo.tier}</Badge>
                  </div>
                  <p className="mt-1 text-sm">
                    {ngo.has_supply ? (
                      <span className="text-foreground">
                        ✓ Tilbud importert ({ngo.chapter_count} lokallag)
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        ⏳ Under arbeid
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
