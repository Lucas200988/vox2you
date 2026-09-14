#!/usr/bin/env bash
# First-time setup of a fresh Ubuntu 22.04/24.04 host, end to end:
#   Docker + git → clone → .env with generated secrets → ./ops/deploy.sh --seed
#
# Run as root (or with sudo) on the server:
#   DOMAIN_APP=crm.exemplo.com.br DOMAIN_API=api.crm.exemplo.com.br ACME_EMAIL=voce@exemplo.com.br \
#   GITHUB_TOKEN=github_pat_xxx BRANCH=main bash bootstrap.sh
#
# Missing variables are asked interactively. Safe to re-run: an existing .env is kept.
set -euo pipefail

REPO="${REPO:-Lucas200988/vox2you}"
BRANCH="${BRANCH:-main}"
TARGET="${TARGET:-/opt/vox2you}"

ask() { # ask VAR "Prompt"
  local var="$1" prompt="$2"
  if [[ -z "${!var:-}" ]]; then read -r -p "$prompt: " "$var"; fi
  [[ -n "${!var:-}" ]] || { echo "$var é obrigatório" >&2; exit 1; }
}

[[ $(id -u) -eq 0 ]] || { echo "Rode como root: sudo bash bootstrap.sh" >&2; exit 1; }

ask DOMAIN_APP "Domínio do CRM (ex.: crm.sonare.com.br)"
ask DOMAIN_API "Domínio da API (ex.: api.crm.sonare.com.br)"
ask ACME_EMAIL "E-mail para os certificados (Let's Encrypt)"
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  read -r -p "Token do GitHub para clonar o repositório privado (enter se o repositório for público): " GITHUB_TOKEN || true
fi
# Tolera um valor colado como "export GITHUB_TOKEN=ghp_..." ou com espaços/aspas em volta:
# um token malformado vira uma URL inválida e o clone falha com uma mensagem obscura.
GITHUB_TOKEN="${GITHUB_TOKEN##*=}"
GITHUB_TOKEN="$(printf '%s' "${GITHUB_TOKEN:-}" | tr -d '[:space:]"'"'")"
if [[ -n "$GITHUB_TOKEN" && ! "$GITHUB_TOKEN" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "✗ Token com formato inesperado. Informe apenas o valor, algo como github_pat_XXXX ou ghp_XXXX." >&2
  exit 1
fi

echo "▶ Conferindo DNS"
PUBLIC_IP=$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me || echo "?")
for d in "$DOMAIN_APP" "$DOMAIN_API"; do
  RESOLVED=$(getent ahostsv4 "$d" | awk '{print $1}' | head -1 || true)
  if [[ -z "$RESOLVED" ]]; then
    echo "  ✗ $d ainda não resolve. Crie o registro A apontando para $PUBLIC_IP e rode de novo (ou continue e o HTTPS falha até o DNS propagar)."
  elif [[ "$RESOLVED" != "$PUBLIC_IP" ]]; then
    echo "  ! $d aponta para $RESOLVED, mas este servidor é $PUBLIC_IP"
  else
    echo "  ✓ $d → $RESOLVED"
  fi
done

echo "▶ Instalando Docker e git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates ufw openssl >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null

if [[ ! -f /swapfile ]]; then
  echo "▶ Swap de 2 GB (o build das imagens precisa de folga de memória)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "▶ Firewall (22, 80, 443)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "▶ Código em $TARGET (branch $BRANCH)"
# Sobra de um clone que falhou: o diretório é criado só por este script, então pode ser refeito.
if [[ -d "$TARGET" && ! -d "$TARGET/.git" ]]; then rm -rf "$TARGET"; fi
if [[ -d "$TARGET/.git" ]]; then
  # O remote fica sem token depois do clone, então reautentica só durante o fetch.
  [[ -n "${GITHUB_TOKEN:-}" ]] && git -C "$TARGET" remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git"
  git -C "$TARGET" fetch --quiet origin "$BRANCH"
  git -C "$TARGET" checkout --quiet "$BRANCH"
  # reset em vez de pull: o servidor nunca tem commits locais, e evita merges travando o deploy
  git -C "$TARGET" reset --hard --quiet "origin/$BRANCH"
  git -C "$TARGET" remote set-url origin "https://github.com/${REPO}.git"
else
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    git clone --quiet --branch "$BRANCH" "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "$TARGET"
    # do not keep the token in the remote URL
    git -C "$TARGET" remote set-url origin "https://github.com/${REPO}.git"
  else
    git clone --quiet --branch "$BRANCH" "https://github.com/${REPO}.git" "$TARGET"
  fi
fi
cd "$TARGET/platform"

if [[ -f .env ]]; then
  echo "▶ .env já existe, mantendo"
else
  echo "▶ Gerando .env com segredos aleatórios"
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  cp .env.example .env
  set_env() { # set_env KEY VALUE  (replaces the line, keeps comments elsewhere)
    local key="$1" value="$2"
    if grep -q "^${key}=" .env; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
      printf '%s=%s\n' "$key" "$value" >> .env
    fi
  }
  set_env NODE_ENV production
  set_env LOG_LEVEL info
  set_env DOMAIN_APP "$DOMAIN_APP"
  set_env DOMAIN_API "$DOMAIN_API"
  set_env ACME_EMAIL "$ACME_EMAIL"
  set_env WEB_ORIGIN "https://$DOMAIN_APP"
  set_env PUBLIC_API_URL "https://$DOMAIN_API"
  set_env NEXT_PUBLIC_API_URL "https://$DOMAIN_API"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  set_env APP_ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
  set_env METRICS_TOKEN "$(openssl rand -hex 16)"
  set_env WHATSAPP_VERIFY_TOKEN "$(openssl rand -hex 16)"
  set_env SEED_ADMIN_EMAIL "$ACME_EMAIL"
  set_env SEED_ADMIN_PASSWORD "$ADMIN_PASSWORD"
  set_env STORAGE_LOCAL_DIR /app/storage
  chmod 600 .env
  printf '%s\n' "$ADMIN_PASSWORD" > /root/.vox-admin-password
  chmod 600 /root/.vox-admin-password
fi

echo "▶ Deploy (build das imagens, migrations, seed). Leva alguns minutos na primeira vez."
./ops/deploy.sh --seed

cat <<EOF

✅ Pronto.
   CRM:    https://$DOMAIN_APP
   API:    https://$DOMAIN_API/ready
   Login:  $(grep '^SEED_ADMIN_EMAIL=' .env | cut -d= -f2-)
   Senha:  $(cat /root/.vox-admin-password 2>/dev/null || echo '(definida no .env em SEED_ADMIN_PASSWORD)')
   Troque a senha em Configurações → Usuários no primeiro acesso.

   Webhook da Meta: https://$DOMAIN_API/webhooks/whatsapp
   (o verify token você define ao cadastrar o WhatsApp em Configurações → Integrações)

   Atualizar depois: cd $TARGET && git pull && cd platform && ./ops/deploy.sh --backup
   Logs:            cd $TARGET/platform && docker compose -f docker-compose.prod.yml logs -f api worker
EOF
