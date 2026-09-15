# Retomada — o que fazer ao voltar

Estado em 2026-09-14 (noite): **o CRM está no ar** em https://vox.sonare.com.br, com API em
https://api.vox.sonare.com.br e os sete containers rodando no Lightsail (`56.125.141.144`). O seed
criou a conta `lucas@sonareengenharia.com.br`, a unidade VOX2you Cuiabá, o funil, os produtos de
exemplo, os prompts e a base de conhecimento inicial. Providers ainda em modo simulação até você
cadastrar as chaves pela tela.

Regra de ouro no terminal do Lightsail: **cole só o conteúdo das caixas cinza**, nunca o texto em
volta. O terminal corrompe a primeira e a última linha coladas, por isso os blocos começam com
`echo inicio` e terminam com `echo fim`. E **nunca cole segredos** (chaves, tokens): o terminal os
mascara com bolinhas. Segredos entram pelo navegador (tela do CRM ou do GitHub) ou digitados.

## 1. Trocar a senha do admin (se ainda não trocou)

A senha gerada no deploy apareceu na tela; troque antes de qualquer outra coisa.

Cole (cria o script):

```
echo inicio
sudo tee /tmp/trocar-senha.sh >/dev/null <<'EOS'
#!/usr/bin/env bash
set -euo pipefail
API=https://api.vox.sonare.com.br/api/v1
EMAIL=lucas@sonareengenharia.com.br
OLD=$(cat /root/.vox-admin-password)
read -r -s -p "Nova senha (mínimo 8 caracteres): " NP; echo
read -r -s -p "Repita a nova senha: " NP2; echo
[[ "$NP" == "$NP2" ]] || { echo "As senhas não conferem."; exit 1; }
[[ ${#NP} -ge 8 ]] || { echo "Muito curta."; exit 1; }
J() { python3 -c 'import json,sys;print(json.dumps(dict(zip(sys.argv[1::2],sys.argv[2::2]))))' "$@"; }
TOKEN=$(curl -fsS -X POST "$API/auth/login" -H 'content-type: application/json' -d "$(J email "$EMAIL" password "$OLD")" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[[ -n "$TOKEN" ]] || { echo "Login com a senha atual falhou."; exit 1; }
ME=$(curl -fsS "$API/auth/me" -H "authorization: Bearer $TOKEN" | sed -n 's/.*"user":{"id":"\([^"]*\)".*/\1/p')
[[ -n "$ME" ]] || { echo "Não achei o usuário."; exit 1; }
curl -fsS -X PATCH "$API/users/$ME" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$(J password "$NP")" >/dev/null
rm -f /root/.vox-admin-password
echo "Senha alterada. Entre no CRM com a nova senha."
EOS
echo fim
```

Depois digite (não cole) e responda às perguntas pelo teclado:

```
sudo bash /tmp/trocar-senha.sh
```

Quando o servidor receber a atualização do passo 2, a troca de senha passa a existir na tela
(Configurações → Usuários → "Minha senha"), e os admins podem editar usuários e redefinir senhas.

## 2. Ativar o canal de atualização (uma vez só)

O servidor não consegue falar com o GitHub (o botão de chave de deploy não habilitou). Solução
definitiva: o **GitHub Actions** entra no servidor por SSH e copia o código. Precisa de três
segredos no GitHub e de uma chave no servidor. Nenhum segredo passa pelo terminal.

**2a. No servidor**, cole:

```
echo inicio
ssh-keygen -q -t ed25519 -f ~/.ssh/gh_actions -N '' -C github-actions
cat ~/.ssh/gh_actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "=== COPIE DAQUI ATÉ A LINHA END (use o botão Copy from terminal) ==="
cat ~/.ssh/gh_actions
echo fim
```

O bloco que aparece entre `-----BEGIN OPENSSH PRIVATE KEY-----` e `-----END OPENSSH PRIVATE KEY-----`
é a chave privada. Copie-o inteiro, incluindo as duas linhas de BEGIN e END. **Não envie para
ninguém, nem no chat.** Ele vai só para o cofre de segredos do GitHub.

**2b. No GitHub**, abra https://github.com/Lucas200988/vox2you/settings/secrets/actions e crie
três segredos com **New repository secret**:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `56.125.141.144` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | a chave privada copiada em 2a |

**2c. Rodar o deploy**: https://github.com/Lucas200988/vox2you/actions/workflows/deploy.yml →
**Run workflow** → Branch `claude/brave-fermat-k7tfvc` → deixe *backup* marcado → **Run workflow**.
Leva uns 8 minutos. O último passo imprime o diagnóstico do servidor. Repita isso sempre que eu
avisar que há uma atualização.

Depois de apagar a chave privada da tela, limpe o terminal com `clear`.

## 3. Configurar o CRM pela tela (Configurações)

Siga o **Checklist de ativação** na aba Integrações; ele mostra o que falta e leva à aba certa.

1. **Unidade**: endereço completo e telefone (o agente envia ao confirmar a visita), fuso.
2. **Integrações → Anthropic**: cole a API key, *Salvar*, *Testar conexão*. Idem **OpenAI**
   (embeddings da base de conhecimento e transcrição de áudio).
3. **Agente**: confira *Modo de venda = SDR*, nome do agente, persona. Preencha o **horário de
   atendimento**: é ele que gera os horários de visita oferecidos na conversa.
4. **Conhecimento**: revise os 4 documentos de exemplo e suba o material real da unidade
   (metodologia, diferenciais, perguntas frequentes, políticas). Sem preços: em modo SDR o agente
   não fala de valor mesmo que estejam lá.
5. **Playground** (menu lateral): converse como cliente e veja a inspeção de cada resposta.
   Peça preço e confira que o agente convida para a visita com horários.
6. **Produtos**: só para reconhecer os programas; valores não são citados em modo SDR.
7. **Usuários**: crie os consultores que vão assumir conversas (papel Vendedor).

## 4. WhatsApp (quando tiver os dados da Meta)

No app Meta (developers.facebook.com), produto WhatsApp:

1. Pegue **Phone number ID**, **WhatsApp Business Account ID** e gere um **token permanente**
   de System User com permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
2. Em **Configurações → Integrações → WhatsApp Business**, preencha tudo, escolha um **verify
   token** (qualquer frase sem espaços), *Salvar*, *Testar conexão*. O canal da unidade é criado
   automaticamente.
3. Na Meta, em WhatsApp → Configuration → Webhook: URL
   `https://api.vox.sonare.com.br/webhooks/whatsapp`, o mesmo verify token, e assine o campo
   **messages**.
4. Mande "oi" do seu celular para o número. A conversa aparece na Inbox e o agente responde.
5. Sincronize os templates (botão na aba Integrações) para follow-ups fora da janela de 24h.

## 5. Operação

- Diagnóstico completo: `cd /opt/vox2you/platform && sudo bash ops/status.sh`
- Logs ao vivo: `cd /opt/vox2you/platform && sudo docker compose -f docker-compose.prod.yml logs -f api worker`
- Backup: diário às 03:00 UTC no volume `backups`, restore ensaiado aos domingos. Backup manual:
  `sudo docker compose -f docker-compose.prod.yml exec backup backup.sh`
- Segredos gerados no deploy ficam em `/opt/vox2you/platform/.env` (senha do Postgres, JWT,
  chave de criptografia). Não apague esse arquivo: sem a chave de criptografia as credenciais
  cadastradas no CRM ficam ilegíveis.

## 6. Feito enquanto você esteve fora

Ver a seção "Estado verificado" em `ROADMAP.md`; os commits na branch trazem o detalhe.

Resumo das etapas entregues nesta rodada (todas com testes, CI verde e enviadas para a branch):

1. **Remarcar/cancelar visita pela conversa** — o agente reconhece "quero remarcar" e "preciso
   cancelar", age na visita já marcada (nunca cria uma segunda) e o cancelamento entra no
   follow-up automático.
2. **CI real** — o GitHub Actions roda lint, typecheck, 90 testes, build do web e das 3 imagens
   Docker a cada push da branch (`.github/workflows/platform-ci.yml`).
3. **Rodízio de leads** — no handoff o lead vai para o consultor da unidade com menos leads
   abertos; botão *Distribuir automaticamente* no painel do lead (`POST /leads/:id/auto-assign`).
4. **Isolamento entre contas provado na API** — teste com dois tenants; duas brechas menores
   fechadas (timeline de lead alheio e `unitId` de outra conta agora dão 404/403).
5. **Worker escalável** — os schedulers usam lock no Redis; pode subir mais réplicas sem duplicar
   trabalho.
6. **Notificações para o vendedor** — sino no topo do CRM (badge de não lidas, marcar como lida)
   e e-mail espelho quando o SMTP estiver configurado em *Configurações → Integrações → E-mail*.
   Dispara em: pedido de atendimento humano, SLA do estágio estourado, visita sem desfecho
   registrado e tarefa criada pelo agente/automação. Um usuário pode desligar o e-mail dele com
   `{"notifyByEmail": false}` em *Usuários* (campo settings).
7. **SLA por estágio** — em *Configurações → Funil / SLA* você define as horas máximas por
   estágio; o kanban marca os leads atrasados e o responsável é notificado (1x por lead por dia).

Para o servidor receber tudo isso: faça o passo 2 (canal de atualização) e rode o workflow
**Deploy** no GitHub. A migração nova (`notifications`) é aplicada automaticamente pelo deploy.

