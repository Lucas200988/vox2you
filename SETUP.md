# Vox2You — Guia de Configuração

## 1. Criar projeto no Supabase

1. Acesse **https://supabase.com** e crie uma conta (gratuita)
2. Clique em **"New project"**
3. Escolha um nome (ex: `vox2you-estoque`) e defina uma senha forte para o banco
4. Aguarde o projeto ser criado (1-2 minutos)

## 2. Configurar o banco de dados

1. No painel do Supabase, vá em **SQL Editor** (menu lateral)
2. Clique em **"New query"**
3. Cole o conteúdo do arquivo `supabase-setup.sql`
4. Clique em **"Run"**

## 3. Obter as credenciais do Supabase

No painel do seu projeto Supabase, vá em **Settings → API**:

| Variável | Onde encontrar |
|----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon public" |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" (cuidado, é secreta) |

Para o banco de dados, vá em **Settings → Database → Connection string**:
- Escolha **"URI"** mode
- Copie a string com **Transaction pooler** (porta 6543) → `DATABASE_URL`
- Copie a string com **Session mode** (porta 5432) → `DIRECT_URL`
- Substitua `[YOUR-PASSWORD]` pela senha que você definiu

## 4. Configurar o arquivo .env

Abra o arquivo `.env` na raiz do projeto e substitua os placeholders:

```env
DATABASE_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

## 5. Instalar dependências e gerar Prisma client

```bash
npm install
npx prisma generate
```

## 6. Criar o primeiro usuário (Gestor)

### Passo 6a — Criar no Supabase Auth
1. No Supabase, vá em **Authentication → Users**
2. Clique em **"Add user"** → **"Create new user"**
3. Informe o e-mail e senha do gestor
4. Clique em **"Create user"**

### Passo 6b — Registrar na tabela users
No **SQL Editor** do Supabase, execute:

```sql
INSERT INTO users (email, name, role)
VALUES ('seuemail@vox2you.com.br', 'Seu Nome Completo', 'gestor');
```

## 7. Rodar o projeto localmente

```bash
npm run dev
```

Acesse: **http://localhost:3000**

Faça login com o e-mail e senha do gestor criado.

## 8. Publicar no Vercel (opcional)

1. Crie uma conta em **https://vercel.com**
2. Conecte seu repositório GitHub (ou use `vercel` CLI)
3. Na configuração do projeto, adicione as variáveis de ambiente do `.env`
4. Deploy automático!

---

## Fluxo de uso inicial

1. **Gestor** cadastra os materiais em **Materiais → Novo Material**
2. **Admin** registra o estoque inicial em **Entrada de Estoque → Nova Entrada**
3. **Vendedor** lança uma venda em **Lançar Venda**
4. **Admin** confirma a entrega em **Entregas Pendentes**
5. **Gestor** acompanha o dashboard e o relatório de reposição

---

## Perfis e permissões

| Funcionalidade | Vendedor | Administrador | Gestor |
|---------------|----------|--------------|--------|
| Dashboard | ✓ | ✓ | ✓ |
| Ver materiais | — | ✓ | ✓ |
| Cadastrar/editar material | — | — | ✓ |
| Entrada de estoque | — | ✓ | ✓ |
| Lançar venda | ✓ | ✓ | ✓ |
| Confirmnar entrega | — | ✓ | ✓ |
| Histórico | — | ✓ | ✓ |
| Relatório de reposição | — | — | ✓ |
| Gerenciar usuários | — | — | ✓ |
