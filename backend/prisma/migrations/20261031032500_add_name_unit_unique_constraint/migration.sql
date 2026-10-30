-- DropIndex
DROP INDEX IF EXISTS "InventoryItem_branchId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_branchId_name_unit_key" ON "InventoryItem"("branchId", "name", "unit");

