-- ============================================================
-- VOX2YOU — Script de configuração do banco de dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- ENUMS
CREATE TYPE "UserRole" AS ENUM ('gestor', 'administrador', 'vendedor');
CREATE TYPE "SaleStatus" AS ENUM ('pendente', 'entregue', 'cancelado');
CREATE TYPE "SaleItemStatus" AS ENUM ('pendente', 'entregue', 'cancelado');
CREATE TYPE "MovementType" AS ENUM ('entrada', 'venda_lancada', 'entrega', 'cancelamento', 'ajuste');

-- USUÁRIOS
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        "UserRole" NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MATERIAIS
CREATE TABLE materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            TEXT UNIQUE NOT NULL,
  type            TEXT NOT NULL,
  stock_current   INTEGER NOT NULL DEFAULT 0,
  stock_minimum   INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ENTRADAS DE ESTOQUE
CREATE TABLE stock_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id     UUID NOT NULL REFERENCES materials(id),
  quantity        INTEGER NOT NULL,
  entry_date      TIMESTAMPTZ NOT NULL,
  responsible_id  UUID NOT NULL REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VENDAS
CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name    TEXT NOT NULL,
  student_phone   TEXT,
  course          TEXT NOT NULL,
  seller_id       UUID NOT NULL REFERENCES users(id),
  sale_date       TIMESTAMPTZ NOT NULL,
  status          "SaleStatus" NOT NULL DEFAULT 'pendente',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ITENS DA VENDA
CREATE TABLE sale_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     UUID NOT NULL REFERENCES sales(id),
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity    INTEGER NOT NULL,
  status      "SaleItemStatus" NOT NULL DEFAULT 'pendente'
);

-- ENTREGAS
CREATE TABLE deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id    UUID UNIQUE NOT NULL REFERENCES sale_items(id),
  delivered_by    UUID NOT NULL REFERENCES users(id),
  delivery_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HISTÓRICO DE MOVIMENTAÇÕES
CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        "MovementType" NOT NULL,
  material_id UUID NOT NULL REFERENCES materials(id),
  quantity    INTEGER NOT NULL,
  sale_id     UUID REFERENCES sales(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- EXEMPLO: Inserir o primeiro usuário gestor
-- (substitua pelo seu e-mail)
-- Após criar o usuário no Supabase Auth, rode:
-- INSERT INTO users (email, name, role)
-- VALUES ('seuemail@exemplo.com', 'Seu Nome', 'gestor');
-- ============================================================
