-- AlterTable
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
