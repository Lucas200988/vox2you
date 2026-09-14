#!/usr/bin/env bash
# Diagnóstico completo do servidor em um comando. Rode como root:
#   cd /opt/vox2you/platform && sudo bash ops/status.sh
# Imprime: DNS, containers, saúde da API, HTTPS/certificado, erros recentes, recursos e o login do admin.
set -uo pipefail
cd "$(dirname "$0")/.." 2>/dev/null || true

line() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

if [[ ! -f .env ]]; then
  echo "✗ .env não encontrado em $(pwd). O bootstrap não chegou a rodar."
  echo "  Rode:  cd /opt/vox2you/platform  e tente de novo, ou reexecute o bootstrap.sh."
  exit 1
fi
set -a; . ./.env; set +a
COMPOSE=(docker compose -f docker-compose.prod.yml)

line "Servidor"
echo "host: $(hostname) | uptime:$(uptime -p 2>/dev/null | sed 's/^up//')"
PUBLIC_IP=$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || echo '?')
echo "IP público: $PUBLIC_IP"
echo "memória: $(free -h | awk '/Mem:/{print $3" / "$2}') | swap: $(free -h | awk '/Swap:/{print $3" / "$2}')"
echo "disco: $(df -h / | awk 'NR==2{print $3" / "$2" ("$5" usado)"}')"

line "DNS"
for d in "${DOMAIN_APP:-}" "${DOMAIN_API:-}"; do
  [[ -n "$d" ]] || continue
  R=$(getent ahostsv4 "$d" | awk '{print $1}' | head -1)
  if [[ -z "$R" ]]; then echo "  ✗ $d não resolve"
  elif [[ "$R" == "$PUBLIC_IP" ]]; then echo "  ✓ $d → $R"
  else echo "  ! $d → $R (esperado $PUBLIC_IP)"; fi
done

line "Containers"
"${COMPOSE[@]}" ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>&1 | head -20

line "API (de dentro do container)"
"${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:4000/ready 2>&1 | head -c 800 || echo "  ✗ API não respondeu"
echo

line "HTTPS público"
for d in "${DOMAIN_APP:-}" "${DOMAIN_API:-}"; do
  [[ -n "$d" ]] || continue
  CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$d/" 2>/dev/null)
  case "$CODE" in
    000) echo "  ✗ https://$d sem resposta (certificado ainda sendo emitido, DNS, ou porta 443 fechada)";;
    *)   echo "  ✓ https://$d → HTTP $CODE";;
  esac
done

line "Certificados (Caddy)"
"${COMPOSE[@]}" logs --tail=200 caddy 2>&1 | grep -iE "certificate obtained|obtaining|error|failed" | tail -8 || echo "  (sem linhas relevantes)"

line "Erros recentes (api / worker)"
"${COMPOSE[@]}" logs --tail=400 api worker 2>&1 | grep -iE '"level":50|"level":60|error|fatal' | tail -12 || echo "  (nenhum)"

line "Acesso"
echo "  CRM:   https://${DOMAIN_APP:-?}"
echo "  API:   https://${DOMAIN_API:-?}/ready"
echo "  Login: $(grep -E '^SEED_ADMIN_EMAIL=' .env | cut -d= -f2-)"
echo "  Senha: $(cat /root/.vox-admin-password 2>/dev/null || grep -E '^SEED_ADMIN_PASSWORD=' .env | cut -d= -f2-)"
echo "  Webhook Meta: https://${DOMAIN_API:-?}/webhooks/whatsapp"
echo
