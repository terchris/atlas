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
COPY dbt/models ./dbt/models
COPY dbt/seeds ./dbt/seeds
COPY dbt/macros ./dbt/macros
COPY dbt/scripts ./dbt/scripts
COPY migrations ./migrations

# --- Install the Dagster code-location package after source is in place -----
# Non-editable install — the source is already inside the image, no need for
# the .pth-file dance. Reinstalls when pyproject.toml OR atlas_data/ changes,
# which is a fine trade-off (this layer is fast: just resolves wheel deps).
RUN uv pip install --system --no-cache ./dagster[deploy]

# --- Dagster gRPC server -----------------------------------------------------
# Port 4000 matches the UIS Dagster doc's expected user-deployments port.
# `--host 0.0.0.0` so Dagster's webserver/daemon (in a different pod) can reach.
EXPOSE 4000
CMD ["dagster", "api", "grpc", \
     "--module-name", "atlas_data.definitions", \
     "--host", "0.0.0.0", \
     "--port", "4000"]
