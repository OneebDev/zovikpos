CREATE TABLE "ApiIdempotency" (
  "scopeKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "responseStatus" INTEGER,
  "responseBody" JSONB,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApiIdempotency_pkey" PRIMARY KEY ("scopeKey"),
  CONSTRAINT "ApiIdempotency_state_check"
    CHECK ("state" IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE INDEX "ApiIdempotency_expiresAt_idx"
  ON "ApiIdempotency" ("expiresAt");
