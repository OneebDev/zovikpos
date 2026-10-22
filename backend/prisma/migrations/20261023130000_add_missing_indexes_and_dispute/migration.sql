-- CreateTable: Dispute
CREATE TABLE IF NOT EXISTS "Dispute" (
    "id" SERIAL PRIMARY KEY,
    "customerId" INTEGER,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "orderId" INTEGER,
    "orderNumber" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Order Issue',
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints safely if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Dispute_customerId_fkey'
    ) THEN
        ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Dispute_orderId_fkey'
    ) THEN
        ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 8 Missing Performance Indexes (additive with IF NOT EXISTS)
-- 1. Composite index on Order(status, branchId, createdAt)
CREATE INDEX IF NOT EXISTS "Order_status_branchId_createdAt_idx" ON "Order"("status", "branchId", "createdAt");

-- 2. Foreign key index on Order(sessionId)
CREATE INDEX IF NOT EXISTS "Order_sessionId_idx" ON "Order"("sessionId");

-- 3. Composite index on Session(tableId, status, expiresAt)
CREATE INDEX IF NOT EXISTS "Session_tableId_status_expiresAt_idx" ON "Session"("tableId", "status", "expiresAt");

-- 4. Composite index on InventoryLog(inventoryItemId, createdAt)
CREATE INDEX IF NOT EXISTS "InventoryLog_inventoryItemId_createdAt_idx" ON "InventoryLog"("inventoryItemId", "createdAt");

-- 5. Foreign key index on OrderStatusHistory(orderId)
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- 6. Date index on AuditLog(createdAt)
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- 7. Composite index on EmailOTP(email, expiresAt)
CREATE INDEX IF NOT EXISTS "EmailOTP_email_expiresAt_idx" ON "EmailOTP"("email", "expiresAt");

-- 8. Foreign key index on CartItem(cartId)
CREATE INDEX IF NOT EXISTS "CartItem_cartId_idx" ON "CartItem"("cartId");
