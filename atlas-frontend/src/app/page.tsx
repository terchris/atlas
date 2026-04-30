import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-8 py-24">
        <header className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Atlas
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            An open data layer for Norway
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Atlas publishes Norwegian public-sector and NGO data — kommune
            statistics, indicators, supply coverage — through a public REST
            API. This site is one consumer of that API; you can build your own.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <Link
            href="/data"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Browse the data →
          </Link>
        </section>

        <section className="flex flex-col gap-2 border-t border-zinc-200 pt-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            <strong className="text-zinc-950 dark:text-zinc-50">
              Building on Atlas?
            </strong>{" "}
            The same data this site uses is available at{" "}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
              api-atlas.helpers.no
            </code>
            . Read the OpenAPI spec at the root, or fork this app as a
            starting template.
          </p>
        </section>
      </main>
    </div>
  );
}
