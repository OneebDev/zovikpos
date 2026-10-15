BEGIN;

-- Legacy NayaPay records are now classified under the app's supported Easypaisa wallet method.
UPDATE "Order"
SET "paymentMethod" = 'Easypaisa'
WHERE upper(trim("paymentMethod")) = 'NAYAPAY';

UPDATE "Payment"
SET "method" = 'Easypaisa'
WHERE upper(trim("method")) = 'NAYAPAY';

COMMIT;
