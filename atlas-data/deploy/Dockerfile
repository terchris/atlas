# Atlas's polyglot Dagster code-location image.
#
# Same image runs as two pod types (per UIS Dagster INVESTIGATE):
#  - Long-lived code-location pod: runs `dagster api grpc`, describes assets.
#  - Ephemeral run pods: spawned by Dagster's K8sRunLauncher per materialisation,
#    execute @asset bodies, shell out to Node ingest scripts via Dagster Pipes.
#
# Both behaviours fall out of a single CMD (`dagster api grpc ...`) — Dagster's
# RunLauncher uses the same image and overrides the entrypoint per run.
#
# Build context: atlas-data/ (the parent directory of this Dockerfile).
#   docker build -t atlas-data:dev -f deploy/Dockerfile .
#
# Expected image size: ~1.5–2 GiB. Optimisation (distroless base, prune dev
# deps, multi-stage with smaller runtime) is a future PLAN — not blocking.

FROM python:3.11-slim AS base

# --- System deps + Node 20 ---------------------------------------------------
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        ca-certificates \
        curl \
        gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install --no-install-recommends -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --- Python deps: dagster + dagster-dbt + dagster-k8s + dbt-postgres ---------
# uv installed via pip so we have it for fast Python deps; subsequent steps
# use `uv pip install --system` to install into the global env (no .venv
# inside the image — keeps run-pod cold-start lean).
RUN pip install --no-cache-dir uv

WORKDIR /app

# --- dbt + Node deps installed first (cached when their manifests don't change) -
COPY dbt/requirements.txt ./dbt/requirements.txt
RUN uv pip install --system --no-cache -r ./dbt/requirements.txt

COPY ingest/package.json ingest/package-lock.json ./ingest/
RUN cd ingest && npm ci --no-audit --no-fund

# --- App source --------------------------------------------------------------
# Copy each top-level subdir explicitly to avoid pulling in dbt_packages,
# node_modules (already installed above), target/, output/, etc.
# .dockerignore at the build-context root reinforces this.
COPY dagster/pyproject.toml ./dagster/pyproject.toml
COPY dagster/atlas_data ./dagster/atlas_data
COPY ingest/src ./ingest/src
COPY ingest/scripts ./ingest/scripts
COPY ingest/tsconfig.json ./ingest/
COPY dbt/dbt_project.yml dbt/packages.yml dbt/profiles.yml ./dbt/
# The generated public-API surface, applied by the api_v1 asset at runtime.
COPY dbt/api_v1_generated.sql ./dbt/
COPY dbt/models ./dbt/models
COPY dbt/seeds ./dbt/seeds
COPY dbt/macros ./dbt/macros
COPY dbt/scripts ./dbt/scripts
# ⚠️ Singular tests live in dbt/tests/ and are NOT covered by models/.
# Omitting this directory left three singular tests — including
# api_v1_descriptions_complete, a gate on the public API surface — absent from
# the compiled manifest, so dbt could never run them in a cluster. Nothing
# failed; they simply were not there. Found by the imac tester in the course of
# correcting an image comparison.
COPY dbt/tests ./dbt/tests
COPY migrations ./migrations

# --- Install the Dagster code-location package after source is in place -----
# Non-editable install — the source is already inside the image, no need for
# the .pth-file dance. Reinstalls when pyproject.toml OR atlas_data/ changes,
# which is a fine trade-off (this layer is fast: just resolves wheel deps).
RUN uv pip install --system --no-cache ./dagster[deploy]

# --- Bake the dbt manifest ---------------------------------------------------
# dagster-dbt needs target/manifest.json to expose dbt models as assets at all.
# Parsing it here, once at build time, is what keeps the run pods cheap: a pod
# that parsed dbt on every materialisation would pay that cost forever, which
# is exactly what definitions.py's cheap-import discipline forbids.
#
# `dbt parse` only reads the project — no database connection — but profiles.yml
# interpolates libpq env vars, so they must be *set* to something for templating
# to resolve. These build-time placeholders are never used to connect and never
# reach the running image; the real connection comes from ATLAS_DATABASE_URL at
# runtime.
ENV DBT_PROFILES_DIR=/app/dbt
# `dbt deps` first: dbt_packages/ is excluded from the build context by
# .dockerignore, so dbt_utils is not in the image until we fetch it here.
RUN cd /app/dbt \
    && dbt deps \
    && PGHOST=build PGPORT=5432 PGUSER=build PGPASSWORD=build PGDATABASE=build \
       dbt parse \
    && test -f target/manifest.json

# --- Where the non-Python payloads live --------------------------------------
# This package is pip-installed into site-packages, but the dbt project and the
# ingest are at /app. Nothing about the installed location implies where they
# are, so say it explicitly. Deriving these by walking up from __file__ is what
# crash-looped the code-location pod in test round 1 (it resolved
# /usr/local/lib/python3.11/dbt). See atlas_data/paths.py.
ENV ATLAS_DBT_PROJECT_DIR=/app/dbt
ENV ATLAS_INGEST_DIR=/app/ingest

# --- Build-time smoke test ---------------------------------------------------
# Import the code location exactly as the pod does, and from `/` rather than
# /app so the run cannot accidentally depend on the working directory — the
# precise condition that hid the path bug from every local check.
#
# This is the gate that turns "CrashLoopBackOff discovered by the cluster
# tester" into "the CI build goes red". Round 1 failed in-cluster on an error
# that a single import would have caught.
RUN cd / && python -c "\
from atlas_data.definitions import defs; \
import atlas_data; \
n = len(defs.resolve_asset_graph().get_all_asset_keys()); \
print(f'smoke: imported {atlas_data.__file__} -> {n} assets'); \
assert n > 100, f'expected >100 assets, got {n}'"

# Run pods run THIS image and must hydrate the platform's run storage before
# executing any step. dagster_postgres is not part of the documented image
# contract, so nothing else would catch its absence — in round 2 the run pod
# died in 5s having executed zero steps. Import it exactly as the run pod does.
RUN cd / && python -c "\
from dagster_postgres.run_storage import PostgresRunStorage; \
import dagster_postgres; \
print(f'smoke: dagster_postgres {dagster_postgres.__version__} run storage importable')"

# Every npm script is invoked by a Pipes subprocess in a container with no .env
# file. `--env-file` is fatal on a missing file; `--env-file-if-exists` is not.
# Assert BOTH that this Node build knows the flag and that no script still uses
# the fatal form — round 2 died on `node: .env: not found`.
RUN cd /app/ingest \
    && node --env-file-if-exists=.env -e "process.exit(0)" \
    && ! grep -q -- "--env-file=" package.json \
    && echo "smoke: npm scripts safe without a .env file"

# The manifest is the only thing that decides which tests can ever run, so
# assert the singular tests actually made it in. This exact defect — a test
# present in git, absent from the image, silently never executed — is the shape
# the contents_code guard exists to catch, and it had happened to the guard
# itself.
RUN cd / && python -c "\
import json; \
m = json.load(open('/app/dbt/target/manifest.json')); \
sing = sorted(n['name'] for n in m['nodes'].values() \
              if n['resource_type'] == 'test' and n.get('test_metadata') is None); \
print(f'smoke: {len(sing)} singular tests in the manifest: {sing}'); \
assert 'contents_code_identifies_an_indicator' in sing, \
    f'the fan-out guard is missing from the image manifest: {sing}'; \
assert len(sing) >= 3, f'expected at least 3 singular tests, found {len(sing)}'"

# --- Dagster gRPC server -----------------------------------------------------
# Port 4000 matches the UIS Dagster doc's expected user-deployments port.
# `--host 0.0.0.0` so Dagster's webserver/daemon (in a different pod) can reach.
EXPOSE 4000
CMD ["dagster", "api", "grpc", \
     "--module-name", "atlas_data.definitions", \
     "--host", "0.0.0.0", \
     "--port", "4000"]
