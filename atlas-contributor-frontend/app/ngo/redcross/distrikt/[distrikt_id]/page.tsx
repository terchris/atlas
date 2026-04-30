import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDistriktDetail } from "@/lib/supply";

export const dynamic = "force-dynamic";

type Params = Promise<{ distrikt_id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { distrikt_id } = await params;
  const detail = await getDistriktDetail(distrikt_id);
  if (!detail) return { title: "Ukjent distrikt — Atlas" };
  return { title: `${detail.distrikt.name} — Atlas` };
}

export default async function DistriktDetailPage({
  params,
}: {
  params: Params;
}) {
  const { distrikt_id } = await params;
  const detail = await getDistriktDetail(distrikt_id);
  if (!detail) notFound();

  const { distrikt, kommune_name, children, child_count, kommune_count, service_category_count } = detail;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link
            href="/ngo/redcross/distrikter"
            className="underline-offset-2 hover:underline"
          >
            ← Alle distrikter
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{distrikt.name}</h1>
          <Badge variant="secondary">distrikt</Badge>
          {!distrikt.is_active && <Badge variant="outline">inaktiv</Badge>}
        </div>
        {kommune_name && (
          <p className="mt-2 text-sm">
            Distriktskontor:{" "}
            <Link
              href={`/kommuner/${distrikt.kommune_nr}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {kommune_name}
            </Link>
          </p>
        )}
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold tabular-nums">{child_count}</p>
            <p className="mt-1 text-sm text-muted-foreground">aktive lokallag</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold tabular-nums">{kommune_count}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              kommuner med tilstedeværelse
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-semibold tabular-nums">
              {service_category_count}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">aktivitetstyper</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lokallag i distriktet</CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen lokallag knyttet til dette distriktet.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {children.map((c) => (
                <li
                  key={c.chapter_id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1 last:border-0"
                >
                  <span>
                    <Link
                      href={`/ngo/redcross/chapters/${c.chapter_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {!c.is_active && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        inaktiv
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {c.kommune_name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
