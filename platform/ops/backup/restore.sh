#!/usr/bin/env bash
# restore.sh <dump> [--verify]
#   default : restores INTO $PGDATABASE (stop api/worker first!). Drops and recreates objects.
#   --verify: restores into a scratch database, checks row counts, drops it. Safe to run any time.
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file> [--verify]}"
MODE="${2:-}"
[[ -f "$DUMP" ]] || { echo "dump not found: $DUMP" >&2; exit 1; }
if [[ -f "$DUMP.sha256" ]]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256") || { echo "checksum mismatch" >&2; exit 1; }
fi

TARGET="${PGDATABASE:-vox}"
if [[ "$MODE" == "--verify" ]]; then
  TARGET="vox_restore_check_$$"
  echo "[restore] verify mode → scratch db $TARGET"
  psql -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE \"$TARGET\";"
  trap 'psql -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET\";" >/dev/null' EXIT
fi

# pgvector must exist before the data (dump carries CREATE EXTENSION, but be explicit)
psql -v ON_ERROR_STOP=1 -d "$TARGET" -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error --jobs=2 -d "$TARGET" "$DUMP"

echo "[restore] row counts in $TARGET:"
psql -d "$TARGET" -At -c "
  select 'tenants', count(*) from tenants
  union all select 'contacts', count(*) from contacts
  union all select 'conversations', count(*) from conversations
  union all select 'messages', count(*) from messages
  union all select 'leads', count(*) from leads
  union all select 'knowledge_chunks', count(*) from knowledge_chunks
  union all select 'migrations', count(*) from _prisma_migrations;" | sed 's/^/  /'
echo "[restore] ok"
