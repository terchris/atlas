#!/usr/bin/env bash
# apply-api-v1.sh — apply the regenerated api_v1.* SQL to Postgres.
#
# Runs `psql -f api_v1_generated.sql` against the database in ingest/.env.
# Separate from regenerate-api-v1.sh because the wrapper views reference
# marts.mart_* tables that only exist after `dbt run`. Calling sequence:
#
#   npm run migrate          # creates raw schemas
#   npm run ingest:*         # populates raw.*
#   dbt run                  # builds marts.*
#   ./apply-api-v1.sh        # creates api_v1.* wrappers (this script)
#
# Idempotent — re-running is a no-op (the generated SQL uses
# CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS throughout).
#
# Canonical guide: website/docs/contributors/api-v1.md

set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f api_v1_generated.sql ]]; then
  echo "✗ api_v1_generated.sql not found. Run ./regenerate-api-v1.sh first." >&2
  exit 1
fi

# Source DATABASE_URL from ingest/.env (the canonical location for PG creds).
# shellcheck disable=SC1091
set -a
. ../ingest/.env
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "✗ DATABASE_URL not set. Check atlas-data/ingest/.env." >&2
  exit 1
fi

# Use the postgres:16-alpine container psql so this works on machines without
# psql installed locally — Atlas's dev env relies on UIS k3s for Postgres,
# and a host-installed psql isn't a project prerequisite.
docker run --rm -i postgres:16-alpine psql \
  "${DATABASE_URL/localhost/host.docker.internal}" \
  -v ON_ERROR_STOP=1 \
  -f - < api_v1_generated.sql

echo "✓ api_v1 applied"
