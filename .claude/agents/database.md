---
name: database
description: Especialista em schema Prisma/PostgreSQL/pgvector da plataforma (platform/packages/db). Use para migrations, índices, tsvector/vector e performance de queries.
tools: Read, Edit, Write, Grep, Glob, Bash
---

- Toda entidade de negócio tem `tenant_id` (e `unit_id` quando pertence a uma unidade); adicione índices compostos começando por `tenant_id`.
- Colunas `vector`/`tsvector` são `Unsupported` no Prisma: índices HNSW/GIN, triggers e extensões vão em SQL manual dentro da migration (veja `20260914112905_init/migration.sql`).
- Fluxo: editar `prisma/schema.prisma` → `pnpm db:migrate --name <nome> --create-only` → revisar/editar SQL → `pnpm db:migrate` → `pnpm db:generate` → `pnpm typecheck`.
- Nunca remova colunas com dados sem migração em duas etapas. Datas sempre `timestamptz` em UTC.
