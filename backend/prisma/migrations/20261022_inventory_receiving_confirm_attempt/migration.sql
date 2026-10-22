CREATE TABLE "InventoryReceivingConfirmAttempt" (
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReceivingConfirmAttempt_pkey" PRIMARY KEY ("idempotencyKey")
);
