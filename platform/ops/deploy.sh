#!/usr/bin/env bash
# One-command deploy/update on a single host with Docker Compose.
#   ./ops/deploy.sh            build + (re)start everything, wait for /ready
#   ./ops/deploy.sh --seed     also run the seed (first deploy only)
#   ./ops/deploy.sh --backup   take a backup before updating
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env ]] || { echo ".env not found — cp .env.example .env and fill the 'Produção' section" >&2; exit 1; }
set -a; . ./.env; set +a
: "${DOMAIN_API:?DOMAIN_API missing in .env}" "${DOMAIN_APP:?DOMAIN_APP missing in .env}" "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing in .env}"
case "${JWT_SECRET:-}" in ""|change-me*) echo "JWT_SECRET must be set (openssl rand -base64 48)" >&2; exit 1;; esac

COMPOSE=(docker compose -f docker-compose.prod.yml)
# rclone config is optional but the bind mount needs a file (a missing path would become a directory)
[[ -f ops/backup/rclone.conf ]] || cp ops/backup/rclone.conf.example ops/backup/rclone.conf

if [[ "${1:-}" == "--backup" || "${2:-}" == "--backup" ]]; then
  echo "▶ backup before update"
  "${COMPOSE[@]}" up -d postgres backup
  "${COMPOSE[@]}" exec backup backup.sh
fi

echo "▶ pulling base images and building app images"
"${COMPOSE[@]}" pull --ignore-buildable
"${COMPOSE[@]}" build --pull api worker web backup

echo "▶ starting (api runs prisma migrate deploy on boot)"
"${COMPOSE[@]}" up -d --remove-orphans

echo "▶ waiting for API readiness"
for i in $(seq 1 40); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:4000/ready >/tmp/vox-ready.json 2>/dev/null; then
    cat /tmp/vox-ready.json; echo
    break
  fi
  sleep 5
  [[ $i -eq 40 ]] && { echo "API did not become ready; logs:"; "${COMPOSE[@]}" logs --tail=100 api; exit 1; }
done

if [[ "${1:-}" == "--seed" || "${2:-}" == "--seed" ]]; then
  echo "▶ seeding tenant/unit/pipeline/products/prompts (idempotent)"
  "${COMPOSE[@]}" exec -T api node apps/api/dist/scripts/seed.js
fi

echo "▶ done: https://${DOMAIN_APP}  (API https://${DOMAIN_API}/ready)"
"${COMPOSE[@]}" ps
