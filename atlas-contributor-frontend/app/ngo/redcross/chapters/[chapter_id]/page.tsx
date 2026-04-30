import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getChapterDetail } from "@/lib/supply";

export const dynamic = "force-dynamic";

type Params = Promise<{ chapter_id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { chapter_id } = await params;
  const detail = await getChapterDetail(chapter_id);
  if (!detail) return { title: "Ukjent lokallag — Atlas" };
  return { title: `${detail.chapter.name} — Atlas` };
}

export default async function ChapterDetailPage({ params }: { params: Params }) {
  const { chapter_id } = await params;
  const detail = await getChapterDetail(chapter_id);
  if (!detail) notFound();

  const { chapter, kommune_name, fylke_name, parent, children, activities, ngo } = detail;
  const ngoSlug = ngo.slug;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/ngo/${ngoSlug}/chapters`}
            className="underline-offset-2 hover:underline"
          >
            ← Alle lokallag
          </Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{chapter.name}</h1>
          <Badge variant="secondary">
            {chapter.chapter_level === "national"
              ? "nasjonalt"
              : chapter.chapter_level === "regional"
                ? "distrikt"
                : "lokallag"}
          </Badge>
          {!chapter.is_active && <Badge variant="outline">inaktiv</Badge>}
        </div>
        {kommune_name && (
          <p className="mt-2 text-sm">
            <Link
              href={`/kommuner/${chapter.kommune_nr}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              {kommune_name}
            </Link>
            {fylke_name && (
              <span className="text-muted-foreground"> · {fylke_name}</span>
            )}
          </p>
        )}
        {chapter.web && (
          <p className="mt-1 text-sm">
            <a
              href={chapter.web}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Lokallagets nettside ↗
            </a>
          </p>
        )}
      </header>

      <section className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Aktiviteter ({activities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ingen aktiviteter registrert for dette lokallaget.
              </p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.activity_id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
                    <span className="text-sm">{a.canonical_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {a.service_category_label_no}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Forelder</CardTitle>
          </CardHeader>
          <CardContent>
            {parent ? (
              <Link
                href={`/ngo/${ngoSlug}/chapters/${parent.chapter_id}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {parent.name}
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ingen forelder (toppnivå eller frittstående).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Underliggende ({children.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {children.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ingen underliggende lokallag.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {children.map((c) => (
                  <li key={c.chapter_id}>
                    <Link
                      href={`/ngo/${ngoSlug}/chapters/${c.chapter_id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {!c.is_active && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        inaktiv
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontakt og adresse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {chapter.postal_address_line1 && <p>{chapter.postal_address_line1}</p>}
            {(chapter.postal_code || chapter.post_office) && (
              <p>
                {chapter.postal_code} {chapter.post_office}
              </p>
            )}
            {chapter.phone && <p>Tlf: {chapter.phone}</p>}
            {chapter.email && (
              <p>
                E-post:{" "}
                <a
                  href={`mailto:${chapter.email}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {chapter.email}
                </a>
              </p>
            )}
            {!chapter.postal_address_line1 &&
              !chapter.postal_code &&
              !chapter.phone &&
              !chapter.email && (
                <p className="text-muted-foreground">
                  Ingen offentlig kontaktinformasjon registrert.
                </p>
              )}
            {chapter.chapter_orgnr && (
              <p className="mt-2 text-xs text-muted-foreground">
                Org.nr: {chapter.chapter_orgnr}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
