#!/usr/bin/env bash
# Dumps the database (custom format, compressed), prunes old dumps and optionally copies off-host.
# Env: PGHOST PGUSER PGPASSWORD PGDATABASE (libpq), BACKUP_DIR, BACKUP_KEEP_DAYS, BACKUP_RCLONE_REMOTE
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/vox-$STAMP.dump"
TMP="$FILE.part"

mkdir -p "$BACKUP_DIR"
echo "[backup] $(date -u +%FT%TZ) starting → $FILE"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TMP" "${PGDATABASE:-vox}"
mv "$TMP" "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
ln -sfn "$(basename "$FILE")" "$BACKUP_DIR/latest.dump"
SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] done ($SIZE)"

# Retention
find "$BACKUP_DIR" -name 'vox-*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] pruned /'
find "$BACKUP_DIR" -name 'vox-*.dump.sha256' -mtime +"$KEEP_DAYS" -delete

# Off-host copy (rclone remote configured in /root/.config/rclone/rclone.conf)
if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  echo "[backup] syncing to $BACKUP_RCLONE_REMOTE"
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE" --no-traverse
  rclone copy "$FILE.sha256" "$BACKUP_RCLONE_REMOTE" --no-traverse
  rclone delete "$BACKUP_RCLONE_REMOTE" --min-age "${KEEP_DAYS}d" --include 'vox-*' || true
fi
echo "[backup] ok $FILE"
