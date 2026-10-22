-- Apply once to existing PostgreSQL databases after updating schema.prisma.
ALTER TABLE "Session" ALTER COLUMN "tableId" DROP NOT NULL;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "tableLabel" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tableLabel" TEXT;

UPDATE "Session" s
SET "tableLabel" = t."tableNumber"
FROM "Table" t
WHERE s."tableId" = t.id
  AND (s."tableLabel" IS NULL OR s."tableLabel" = 'Takeaway / Counter' OR lower(trim(s."tableLabel")) = 'dining table');

UPDATE "Session"
SET "tableLabel" = 'Counter'
WHERE "tableId" IS NULL AND ("tableLabel" IS NULL OR "tableLabel" = '');

UPDATE "Session"
SET "tableLabel" = 'Counter'
WHERE "tableId" IS NULL
  AND lower(trim("tableLabel")) IN ('takeaway / counter', 'takeaway', 'takeout', 'dining table');

UPDATE "Order" o
SET "tableNumber" = t."tableNumber",
    "tableLabel" = t."tableNumber"
FROM "Table" t
WHERE o."tableId" = t.id
  AND (o."tableLabel" IS NULL OR o."tableLabel" = '' OR lower(trim(o."tableLabel")) IN ('dining table', 'takeaway', 'takeout', 'counter', 'takeaway / counter') OR o."tableNumber" IS NULL OR o."tableNumber" = '');

UPDATE "Order"
SET "tableLabel" = CASE
  WHEN "tableNumber" IS NULL OR "tableNumber" = '' OR lower("tableNumber") IN ('dining table', 'takeaway', 'takeout', 'counter')
    THEN 'Counter'
  ELSE "tableNumber"
END
WHERE "tableLabel" IS NULL OR "tableLabel" = '';

UPDATE "Order"
SET "tableNumber" = 'Counter', "tableLabel" = 'Counter'
WHERE "tableId" IS NULL
  AND lower(trim(coalesce("tableLabel", "tableNumber", ''))) IN ('takeaway / counter', 'takeaway', 'takeout', 'counter', 'dining table');

-- Sessions created by the customer web flow must always provide a real table snapshot.
-- Remove any historical database default without changing existing session rows.
ALTER TABLE "Session" ALTER COLUMN "tableLabel" DROP DEFAULT;
