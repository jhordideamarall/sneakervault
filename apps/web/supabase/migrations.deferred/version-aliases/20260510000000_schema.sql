-- ============================================================================
-- SneakerVault — 00: Schema (extensions, enums, tables, constraints, indexes)
-- ============================================================================
-- This migration creates all tables with strict CHECK constraints. It does NOT
-- create functions, triggers, or RLS policies (those live in later migrations).
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('owner', 'admin_gudang', 'admin_online', 'shopkeeper');

CREATE TYPE stock_movement_type AS ENUM (
  'inbound', 'outbound', 'return_in', 'return_out', 'adjustment'
);

CREATE TYPE session_status AS ENUM (
  'packing', 'shipped', 'completed', 'has_return', 'cancelled'
);

CREATE TYPE return_type AS ENUM ('exchange_size', 'refund');

CREATE TYPE return_status AS ENUM ('pending', 'verified', 'processed', 'cancelled');

CREATE TYPE delete_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE delete_entity_type AS ENUM (
  'product', 'packing_session', 'stock_movement', 'purchase_batch'
);

-- ─── profiles ───────────────────────────────────────────────────────────────
-- Extends auth.users. Auto-created on signup via trigger in 02_triggers.sql.
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL CHECK (length(trim(full_name)) > 0),
  email       text NOT NULL CHECK (length(trim(email)) > 0),
  roles       user_role[] NOT NULL DEFAULT '{}',
  avatar_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── suppliers ──────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  contact_person  text,
  phone           text,
  email           text,
  address         text,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── products ───────────────────────────────────────────────────────────────
-- One row per unique SKU+size combination. Barcode is globally unique.
-- HPP is weighted-average cost per MODEL (all sizes of same model share HPP).
CREATE TABLE products (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand                text NOT NULL CHECK (length(trim(brand)) > 0),
  model                text NOT NULL CHECK (length(trim(model)) > 0),
  sku                  text NOT NULL CHECK (length(trim(sku)) > 0),
  size                 numeric NOT NULL CHECK (size > 0),
  color                text,
  barcode              text NOT NULL CHECK (length(trim(barcode)) > 0),
  quantity             integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  hpp                  numeric NOT NULL DEFAULT 0 CHECK (hpp >= 0),
  sell_price           numeric NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  default_supplier_id  uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  image_url            text,
  is_active            boolean NOT NULL DEFAULT true,
  first_inbound_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ─── purchase_batches ───────────────────────────────────────────────────────
-- A single purchase order to a supplier. May cover one model across many sizes.
CREATE TABLE purchase_batches (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id             uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  brand                   text NOT NULL CHECK (length(trim(brand)) > 0),
  model                   text NOT NULL CHECK (length(trim(model)) > 0),
  product_id              uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity                integer NOT NULL CHECK (quantity > 0),
  defect_quantity         integer NOT NULL DEFAULT 0 CHECK (defect_quantity >= 0),
  returned_to_supplier    integer NOT NULL DEFAULT 0 CHECK (returned_to_supplier >= 0),
  unit_cost               numeric NOT NULL CHECK (unit_cost >= 0),
  authenticity_confirmed  boolean NOT NULL DEFAULT false,
  notes                   text,
  ordered_at              timestamptz NOT NULL,
  received_at             timestamptz,
  created_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_defect_le_qty        CHECK (defect_quantity <= quantity),
  CONSTRAINT chk_returned_le_defect   CHECK (returned_to_supplier <= defect_quantity),
  CONSTRAINT chk_received_after_order CHECK (received_at IS NULL OR received_at >= ordered_at)
);

-- ─── stock_movements ────────────────────────────────────────────────────────
-- Immutable audit log of every stock change. Generally never deleted; the only
-- exception is rollback of an outbound packing_item (see RLS in 03_rls.sql).
CREATE TABLE stock_movements (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type            stock_movement_type NOT NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  unit_cost       numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type  text,
  reference_id    uuid,
  notes           text,
  performed_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── packing_sessions ───────────────────────────────────────────────────────
-- Header: one order being packed. Items are scanned into it.
CREATE TABLE packing_sessions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packed_by           uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  platform            text NOT NULL CHECK (length(trim(platform)) > 0),
  platform_order_id   text,
  courier             text NOT NULL CHECK (length(trim(courier)) > 0),
  courier_custom      text,
  status              session_status NOT NULL DEFAULT 'packing',
  status_updated_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  packed_at           timestamptz,
  shipped_at          timestamptz,
  completed_at        timestamptz,
  returned_at         timestamptz,
  created_by          uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_courier_custom_when_other
    CHECK (courier <> 'other' OR (courier_custom IS NOT NULL AND length(trim(courier_custom)) > 0)),
  CONSTRAINT chk_courier_required_when_online
    CHECK (platform = 'offline' OR courier <> 'offline')
);

-- ─── packing_items ──────────────────────────────────────────────────────────
-- One row per scanned item. unit_hpp and sell_price are snapshots at scan time.
CREATE TABLE packing_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_session_id  uuid NOT NULL REFERENCES packing_sessions(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  barcode_scanned     text NOT NULL CHECK (length(trim(barcode_scanned)) > 0),
  unit_hpp            numeric NOT NULL DEFAULT 0 CHECK (unit_hpp >= 0),
  sell_price          numeric NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── returns ────────────────────────────────────────────────────────────────
-- Per-item return (not per-session). Two-step verification: admin_online
-- initiates → admin_gudang verifies → admin_gudang/owner processes.
CREATE TABLE returns (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_item_id      uuid NOT NULL REFERENCES packing_items(id) ON DELETE RESTRICT,
  type                 return_type NOT NULL,
  reason               text NOT NULL CHECK (length(trim(reason)) > 0),
  original_size        numeric NOT NULL CHECK (original_size > 0),
  new_size             numeric CHECK (new_size IS NULL OR new_size > 0),
  original_product_id  uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  new_product_id       uuid REFERENCES products(id) ON DELETE RESTRICT,
  status               return_status NOT NULL DEFAULT 'pending',
  verified_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at          timestamptz,
  processed_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  CONSTRAINT chk_exchange_requires_new_product
    CHECK (type <> 'exchange_size' OR status <> 'processed' OR new_product_id IS NOT NULL),
  CONSTRAINT chk_verified_before_processed
    CHECK (processed_at IS NULL OR verified_at IS NOT NULL)
);

-- ─── activity_logs ──────────────────────────────────────────────────────────
-- Immutable audit log. Only owner can read. No updates or deletes.
CREATE TABLE activity_logs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (length(trim(action)) > 0),
  entity_type  text NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  ip_address   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── delete_requests ────────────────────────────────────────────────────────
-- Anti-fraud: no direct delete buttons. Users request; owner approves.
CREATE TABLE delete_requests (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requested_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  entity_type   delete_entity_type NOT NULL,
  entity_id     uuid NOT NULL,
  reason        text NOT NULL CHECK (length(trim(reason)) > 0),
  status        delete_request_status NOT NULL DEFAULT 'pending',
  reviewed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  review_notes  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
-- products: barcode is the hot lookup path (every scan).
CREATE UNIQUE INDEX idx_products_barcode         ON products(barcode);
CREATE UNIQUE INDEX idx_products_sku             ON products(sku);
CREATE        INDEX idx_products_brand_model     ON products(brand, model);
CREATE        INDEX idx_products_active          ON products(is_active) WHERE is_active = true;

-- stock_movements: product history and type filters.
CREATE INDEX idx_stock_movements_product   ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_type      ON stock_movements(type, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- packing_sessions: status dashboards and filters.
CREATE INDEX idx_packing_sessions_status    ON packing_sessions(status, created_at DESC);
CREATE INDEX idx_packing_sessions_platform  ON packing_sessions(platform, created_at DESC);
CREATE INDEX idx_packing_sessions_courier   ON packing_sessions(courier, created_at DESC);
CREATE INDEX idx_packing_sessions_packed_by ON packing_sessions(packed_by, created_at DESC);

-- packing_items: session detail and per-product sold history.
CREATE INDEX idx_packing_items_session ON packing_items(packing_session_id);
CREATE INDEX idx_packing_items_product ON packing_items(product_id, created_at DESC);

-- purchase_batches: supplier and model queries.
CREATE INDEX idx_purchase_batches_supplier ON purchase_batches(supplier_id, created_at DESC);
CREATE INDEX idx_purchase_batches_model    ON purchase_batches(brand, model, created_at DESC);

-- returns: status filters.
CREATE INDEX idx_returns_status ON returns(status, created_at DESC);

-- activity_logs: user/entity drill-down.
CREATE INDEX idx_activity_logs_user   ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- delete_requests: pending queue.
CREATE INDEX idx_delete_requests_status ON delete_requests(status, created_at DESC);
