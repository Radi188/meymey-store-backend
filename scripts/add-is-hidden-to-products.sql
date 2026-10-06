-- Migration: let a product be hidden so it can't be sold.
-- Run this once in your Supabase SQL editor BEFORE deploying the backend that
-- filters on it — product listings query this column.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_hidden ON products (is_hidden);

COMMENT ON COLUMN products.is_hidden IS
  'Hidden products are left out of product listings (POS, storefront, Telegram shop) and are rejected when a sales order is created or completed. Stock and history are kept.';
