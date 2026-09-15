# Runbooks — operação da plataforma VOX2you

Procedimentos curtos para os incidentes mais prováveis. Todos os comandos rodam no servidor, como
root, a partir de `/opt/vox2you/platform` (`cd /opt/vox2you/platform`). `dc` abaixo significa
`docker compose -f docker-compose.prod.yml`.

Primeiro passo em qualquer incidente: `sudo bash ops/status.sh` — mostra DNS, containers, `/ready`,
certificado HTTPS, erros recentes e recursos da máquina.

## 1. Site ou API fora do ar (`ApiDown`, "502" no navegador)

1. `dc ps` — algum container `Exit`/`Restarting`?
2. `dc logs --tail=200 api` (ou `web`, `caddy`). Erros típicos:
   - `ECONNREFUSED ...:5432` → Postgres caiu: `dc up -d postgres` e aguarde `healthy`.
   - `Redis connection` → `dc up -d redis`.
   - `JWT_SECRET must be set` / `APP_ENCRYPTION_KEY` → `.env` foi alterado; restaure o backup do
     `.env` (nunca gere uma chave de criptografia nova: as credenciais salvas no CRM ficariam
     ilegíveis).
3. Subir tudo de novo: `dc up -d`. Confirmar: `curl -s https://api.<domínio>/ready`.
4. Se o Caddy não emite certificado (`caddy` em loop): DNS do domínio precisa apontar para o IP
   fixo e as portas 80/443 abertas no firewall do Lightsail.

## 2. Mensagens do WhatsApp não chegam

1. Na Meta (WhatsApp → Configuration): o webhook está verificado e o campo `messages` assinado?
   URL: `https://api.<domínio>/webhooks/whatsapp`.
2. `dc logs --tail=200 api | grep -i webhook` — `signature invalid` significa **App Secret**
   errado em Configurações → Integrações → WhatsApp (o teste de conexão não valida o secret;
   só o token).
3. `dc logs --tail=200 worker` — a fila `inbound` processa? Se aparecer `QueueBacklog` no alerta,
   veja o item 4.
4. Teste de ponta a ponta sem Meta: Inbox → **Simular mensagem** (usa o canal da unidade).

## 3. Agente responde errado / não responde

- **Não responde e a conversa está em modo humano**: alguém assumiu (handoff). Devolva para a IA
  no painel da conversa.
- **Resposta bloqueada** (`decision = blocked` em Analytics → Execuções): a validação barrou
  preço/parcela/desconto ou alucinação. Confira o catálogo (Produtos) e a base (Conhecimento).
  No modo SDR o agente nunca fala de valores — isso é esperado.
- **Sem IA configurada**: Configurações → Integrações → Anthropic/OpenAI. Sem chave, o sistema
  roda com o provedor *mock* (respostas de laboratório) e o alerta
  `PendingCredentialsInProduction` fica ativo.
- Para reproduzir uma conversa: Playground (não envia nada ao cliente).

## 4. Fila travada (`QueueBacklog`, `QueueFailures`, `OutboxStuck`)

1. `dc logs --tail=300 worker` — procure a exceção repetida.
2. Jobs que falharam 3x vão para a fila `dead-letter`; o motivo fica no log com `dead-letter`.
3. Reiniciar o worker resolve travas de conexão: `dc restart worker`.
4. Outbox parado (eventos não publicados crescendo em `/metrics`): confirme que ao menos um
   worker está de pé; os schedulers tomam lock no Redis — se o Redis foi trocado/limpo, basta
   esperar o próximo tick (≤ 10 min).

## 5. Follow-ups não saem (`FollowUpsOverdue`)

- Fora da janela de 24h do WhatsApp só sai **template aprovado**. Sincronize os templates em
  Integrações → WhatsApp e confira o nome usado na política de follow-up.
- Sem template disponível, o sistema cria uma **tarefa** para o consultor em vez de enviar —
  isso aparece em Tarefas e no sino de notificações.

## 6. Custo de IA disparou (`AgentCostSpike`)

1. Analytics → IA: execuções, tokens e custo por período; Execuções recentes mostram o modelo.
2. Reduza o modelo "smart" para o "fast" em Integrações → Anthropic, ou limite a unidade
   (Configurações → Agente → desativar temporariamente).
3. Loops de conversa (cliente automatizado) aparecem como muitas execuções na mesma conversa:
   pause a conversa (modo humano) e bloqueie o contato se for spam.

## 7. Restaurar backup

Backups diários em volume `backups` (14 dias), 03:00 UTC, com ensaio de restore aos domingos.

```bash
dc exec backup ls -la /backups                          # escolher o arquivo
dc exec backup restore.sh /backups/<arquivo> --verify   # ensaio em banco temporário
dc stop api worker                                      # parar escrita
dc exec backup restore.sh /backups/<arquivo>            # restore real (destrói o atual)
dc start api worker
```

Backup manual antes de qualquer operação arriscada: `dc exec backup backup.sh`.

## 8. Atualizar a plataforma

- Pelo GitHub: Actions → **Deploy** → *Run workflow* (precisa dos secrets `DEPLOY_HOST`,
  `DEPLOY_USER`, `DEPLOY_SSH_KEY`; ver `docs/RETOMADA.md` §2).
- Manual no servidor: `git pull && ./ops/deploy.sh --backup`. O deploy aplica migrações
  automaticamente e espera o `/ready`.
- Voltar uma versão: `git checkout <commit-anterior> && ./ops/deploy.sh`. Migrações não são
  revertidas — restaure o backup feito pelo `--backup` se a versão antiga não subir.

## 9. Disco cheio

1. `df -h` e `docker system df`.
2. Limpar imagens antigas: `docker image prune -af` (as em uso ficam).
3. Logs: `docker compose` já rotaciona (`max-size` no compose). Backups antigos: reduza
   `BACKUP_KEEP_DAYS` no `.env` e reinicie o `backup`.
4. Anexos ficam no volume `storage`; migre para S3 em Integrações → Armazenamento se crescer.

## 10. Usuário sem acesso

- Esqueceu a senha: um admin redefine em Configurações → Usuários. Sem admin disponível,
  `/tmp/trocar-senha.sh` (ver `docs/RETOMADA.md` §1) redefine a senha de qualquer e-mail.
- Conta bloqueada por tentativas (`429 account_locked`): destrava sozinha em até 30 min; para
  liberar na hora: `dc exec redis redis-cli --scan --pattern 'auth:lock:*' | xargs -r dc exec -T redis redis-cli del`.
- E-mail existe em duas contas (tenants): o login pede o `tenant` (slug) — informe-o na tela.

## 11. Suspeita de vazamento entre contas

Cada rota filtra por `tenantId` do token e recusa `unitId` de outra conta (403). Se algo
parecer cruzado, colete o `reqId` do log, abra Auditoria (Configurações) e reporte com o
`agent_run`/`conversation` envolvidos. Testes automáticos: `tests/integration/channel-isolation`
e `apps/api/src/tenant-isolation.test.ts`.
