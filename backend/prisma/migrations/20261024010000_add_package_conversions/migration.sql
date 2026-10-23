-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "packageConversions" JSONB;
