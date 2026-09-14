#!/usr/bin/env bash
# Runs backup.sh once a day at BACKUP_HOUR (UTC) and a restore --verify once a week (Sundays).
set -uo pipefail
HOUR="${BACKUP_HOUR:-03}"
echo "[backup-loop] daily at ${HOUR}:00 UTC, keep ${BACKUP_KEEP_DAYS:-14} days, remote='${BACKUP_RCLONE_REMOTE:-}'"
LAST_DAY=""
while true; do
  NOW_H=$(date -u +%H); NOW_D=$(date -u +%F)
  if [[ "$NOW_H" == "$HOUR" && "$NOW_D" != "$LAST_DAY" ]]; then
    LAST_DAY="$NOW_D"
    if backup.sh; then
      if [[ "$(date -u +%u)" == "7" ]]; then restore.sh /backups/latest.dump --verify || echo "[backup-loop] WEEKLY RESTORE VERIFY FAILED" >&2; fi
    else
      echo "[backup-loop] BACKUP FAILED" >&2
    fi
  fi
  sleep 60
done
