#!/usr/bin/env bash
# Cria (se não existir) a chave de deploy do servidor e imprime a parte pública.
# Nenhum segredo trafega pelo terminal: a chave privada nasce e fica em /root/.ssh.
#   sudo bash ops/deploy-key.sh
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo "Rode como root: sudo bash ops/deploy-key.sh" >&2; exit 1; }

REPO="${REPO:-Lucas200988/vox2you}"
SSH_KEY="${SSH_KEY:-/root/.ssh/vox_deploy}"

mkdir -p "$(dirname "$SSH_KEY")"
chmod 700 "$(dirname "$SSH_KEY")"
if [[ -f "$SSH_KEY" ]]; then
  echo "▶ Chave já existe em $SSH_KEY"
else
  ssh-keygen -q -t ed25519 -f "$SSH_KEY" -N '' -C "vox2you-$(hostname)"
  echo "▶ Chave criada em $SSH_KEY"
fi

cat <<EOF

Copie a linha abaixo (botão "Copy from terminal") e cadastre em:
  https://github.com/${REPO}/settings/keys/new
  Title: servidor vox2you   |   deixe "Allow write access" DESMARCADO

EOF
cat "$SSH_KEY.pub"
echo

if ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "✓ GitHub já reconhece esta chave."
else
  echo "… GitHub ainda não reconhece a chave. Cadastre-a e rode este script de novo para confirmar."
fi
