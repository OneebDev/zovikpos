-- Apply to an existing PostgreSQL database before deploying the updated backend.
ALTER TABLE "InventoryReceiving"
  ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountPercent" DOUBLE PRECISION;
