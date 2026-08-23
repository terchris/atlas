"""
Locating Atlas's non-Python payloads — the dbt project and the TypeScript ingest.

## Why this module exists

The polyglot image ships the `atlas_data` package **twice**: once as source at
`/app/dagster/atlas_data/`, and once pip-installed into
`/usr/local/lib/python3.11/site-packages/atlas_data/`. Python imports the
site-packages copy. Meanwhile the dbt project and the ingest live at `/app/dbt`
and `/app/ingest` — nowhere near it.

The original code derived both by walking a fixed number of parents up from
`__file__`, with a comment asserting that up-4 lands on `/app`. That is true of
the source tree and false of the installed copy, where up-4 lands on
`/usr/local/lib/python3.11`. The code-location pod CrashLoopBackOffed on import
(11 restarts) looking for `/usr/local/lib/python3.11/dbt/target/manifest.json`,
which the imac tester caught in round 1.

The lesson generalises: **where the code is installed tells you nothing about
where the data lives.** So resolution is now explicit, in this order:

1. `ATLAS_DBT_PROJECT_DIR` / `ATLAS_INGEST_DIR` — set by the Dockerfile. This is
   the mechanism that matters in production; everything else is a convenience.
2. Otherwise, walk up from this file looking for a directory containing the
   right sentinel file. This is what makes a source checkout work with no
   configuration, at any nesting depth, without hardcoding a parent count.
3. Otherwise raise, naming both the env var and what was searched.

Only a few `is_file()` calls at import, so this stays inside definitions.py's
cheap-import discipline.
"""

import os
from pathlib import Path

_HERE = Path(__file__).resolve()


def _discover(dir_name: str, sentinel: str) -> "Path | None":
    """Walk up from this file for `<parent>/<dir_name>/<sentinel>`."""
    for parent in _HERE.parents:
        candidate = parent / dir_name
        if (candidate / sentinel).is_file():
            return candidate.resolve()
    return None


def _resolve(env_var: str, dir_name: str, sentinel: str) -> Path:
    override = os.getenv(env_var)
    if override:
        # Not validated here on purpose: an explicitly configured path that is
        # wrong should fail where it is used, with that path in the message,
        # rather than be silently discarded in favour of a discovered one.
        return Path(override).resolve()

    found = _discover(dir_name, sentinel)
    if found is not None:
        return found

    searched = ", ".join(str(p / dir_name) for p in _HERE.parents[:5])
    raise FileNotFoundError(
        f"Could not locate Atlas's `{dir_name}` directory (looked for "
        f"{dir_name}/{sentinel}). Set {env_var} to its absolute path. "
        f"In the polyglot image the Dockerfile sets it. Searched: {searched}"
    )


def dbt_project_dir() -> Path:
    """The dbt project root — the directory holding dbt_project.yml."""
    return _resolve("ATLAS_DBT_PROJECT_DIR", "dbt", "dbt_project.yml")


def ingest_dir() -> Path:
    """The TypeScript ingest root — the directory holding package.json."""
    return _resolve("ATLAS_INGEST_DIR", "ingest", "package.json")
