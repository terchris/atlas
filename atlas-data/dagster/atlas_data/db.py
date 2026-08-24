"""
Turning Atlas's one connection secret into the several forms its tools want.

The tenant contract with the platform is deliberately **one secret, one variable**:
`ATLAS_DATABASE_URL`. But dbt's profiles.yml wants five separate libpq variables
(`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`), because locally they
arrive from `atlas-data/ingest/.env` — as its own comment says.

In a run pod nothing sets them, and dbt fails at parse time with
`Env var required but not provided: 'PGHOST'`. That is what failed criteria 10–12
in test round 3, and it is the same shape as the earlier `--env-file` blocker: a
local-dev mechanism that does not survive containerisation.

Rather than ask the platform for five more secrets — which would make Atlas a
special case and leave two sources of truth for one connection — the URL is
decomposed here, at the point of use.
"""

from urllib.parse import unquote, urlparse


def libpq_env_from_url(database_url: str) -> "dict[str, str]":
    """
    Map a Postgres URL onto the five libpq env vars dbt's profiles.yml reads.

    All five are always returned, empty string included. `env_var('PGPASSWORD')`
    with no default raises if the variable is *unset*, so a passwordless
    connection (trust auth, common in local dev) must still set it to "".
    """
    parsed = urlparse(database_url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError(
            f"Expected a postgres:// or postgresql:// URL, got scheme "
            f"{parsed.scheme!r}. Check ATLAS_DATABASE_URL."
        )
    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError(
            "Database URL has no database name (nothing after the final '/'). "
            "Check ATLAS_DATABASE_URL."
        )
    # unquote: URL-encoded credentials are legal and common (a password
    # containing '@' or '/' must be percent-encoded in the URL), but libpq
    # wants the decoded value.
    return {
        "PGHOST": parsed.hostname or "",
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": unquote(parsed.username) if parsed.username else "",
        "PGPASSWORD": unquote(parsed.password) if parsed.password else "",
        "PGDATABASE": database,
    }
