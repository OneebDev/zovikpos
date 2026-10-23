# Least-Privilege Database Access Plan (PostgreSQL)

> [!NOTE]
> **Status: Future Hardening (Post-MVP / Viva)**
> Is initial deployment mein runtime least-privilege DB roles implement **NAHI** kiye ja rahe hain.
> Heroku Postgres Essential-0 tier par multi-user credential scoping support limited hoti hai; is feature ke liye **Heroku Postgres Standard tier+** darkaar hai.
> Yeh document production-grade hardening reference ke taur par rakha gaya hai.

## 1. Overview
This plan specifies runtime least-privilege security configurations for PostgreSQL on Heroku/Supabase.
It establishes two distinct roles:
1. **`pos_app` (Application Runtime Role):** Strictly limited to Data Manipulation Language (DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`) on application tables and sequence operations. Possesses zero DDL permissions (`NO CREATE TABLE`, `NO DROP`, `NO ALTER`).
2. **`pos_migrator` (Release & Migration Role):** Used exclusively during Heroku release phase (`npx prisma migrate deploy`). Has full schema DDL access.

---

## 2. Tables & Objects Accessed by Runtime Application

Derived directly from `prisma/schema.prisma` and runtime service queries:

| Table Name | Operations | Notes |
| :--- | :--- | :--- |
| `Branch` | SELECT, INSERT, UPDATE, DELETE | Multi-branch configuration |
| `Table` | SELECT, INSERT, UPDATE, DELETE | Dining tables and signed QR tokens |
| `User` | SELECT, INSERT, UPDATE, DELETE | Customer & Staff accounts |
| `Session` | SELECT, INSERT, UPDATE, DELETE | Dining sessions & lifecycle states |
| `Cart` | SELECT, INSERT, UPDATE, DELETE | Active table dining carts |
| `CartItem` | SELECT, INSERT, UPDATE, DELETE | Cart line items |
| `Category` | SELECT, INSERT, UPDATE, DELETE | Menu categories |
| `MenuItem` | SELECT, INSERT, UPDATE, DELETE | Menu items and pricing |
| `Order` | SELECT, INSERT, UPDATE, DELETE | Orders and status tracking |
| `OrderItem` | SELECT, INSERT, UPDATE, DELETE | Order line item snapshots |
| `Payment` | SELECT, INSERT, UPDATE, DELETE | Payment records |
| `ETAPrediction` | SELECT, INSERT, UPDATE, DELETE | AI prep ETA records |
| `DemandForecast` | SELECT, INSERT, UPDATE, DELETE | AI demand forecasts |
| `Supplier` | SELECT, INSERT, UPDATE, DELETE | Inventory suppliers |
| `RecipeItem` | SELECT, INSERT, UPDATE, DELETE | Menu-inventory recipe linkage |
| `InventoryItem` | SELECT, INSERT, UPDATE, DELETE | Stock items, thresholds & costs |
| `InventoryLog` | SELECT, INSERT, UPDATE, DELETE | Immutable inventory ledger |
| `InventoryReceiving` | SELECT, INSERT, UPDATE, DELETE | Stock receiving batches |
| `InventoryReceivingItem` | SELECT, INSERT, UPDATE, DELETE | Stock receiving lines |
| `InventoryReceivingConfirmAttempt` | SELECT, INSERT, UPDATE, DELETE | Receiving idempotency records |
| `EmailOTP` | SELECT, INSERT, UPDATE, DELETE | Verification OTP records |
| `AuditLog` | SELECT, INSERT, UPDATE, DELETE | System audit trail |
| `ApiIdempotency` | SELECT, INSERT, UPDATE, DELETE | API idempotency locks and responses |
| `OrderStatusHistory` | SELECT, INSERT, UPDATE, DELETE | Order status transitions |
| `PaymentSetting` | SELECT, INSERT, UPDATE, DELETE | COD/Online payment toggles |
| `Dispute` | SELECT, INSERT, UPDATE, DELETE | Customer disputes & complaints |

---

## 3. SQL Role Provisioning Script

Run as the database administrator / superuser:

```sql
-- 1. Create Migration / DDL Role
CREATE ROLE pos_migrator WITH LOGIN PASSWORD 'MIGRATION_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON SCHEMA public TO pos_migrator;
ALTER SCHEMA public OWNER TO pos_migrator;

-- 2. Create Runtime / DML Role (No DDL, No Superuser)
CREATE ROLE pos_app WITH LOGIN PASSWORD 'APP_RUNTIME_SECURE_PASSWORD_HERE';

-- Grant connection and schema usage
GRANT CONNECT ON DATABASE "your_database_name" TO pos_app;
GRANT USAGE ON SCHEMA public TO pos_app;

-- Grant DML permissions on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pos_app;

-- Grant sequence permissions (required for SERIAL / autoincrement primary keys)
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pos_app;

-- Ensure future tables created by migrations automatically grant DML to pos_app
ALTER DEFAULT PRIVILEGES FOR ROLE pos_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pos_app;

ALTER DEFAULT PRIVILEGES FOR ROLE pos_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO pos_app;

-- Revoke all administrative and DDL capabilities from the app runtime user
REVOKE CREATE ON SCHEMA public FROM pos_app;
REVOKE ALL ON SCHEMA information_schema FROM pos_app;
```

---

## 4. Heroku / Deployment Specifics

> **Note on Heroku Postgres:**
> Heroku Postgres managed attachments default to a single master database credential (`DATABASE_URL`). To implement two-tier least-privilege on Heroku:
> 1. Use `heroku pg:credentials:create` to create a scoped runtime credential.
> 2. Attach the scoped credential to `DATABASE_URL` (consumed by dynos).
> 3. Store the master credential in `MIGRATION_DATABASE_URL` for `Procfile` release phase execution:
>    ```procfile
>    release: DATABASE_URL=$MIGRATION_DATABASE_URL npx prisma migrate deploy
>    web: node src/server.js
>    ```
> *(Verify exact multi-credential support with your Heroku Postgres tier documentation)*.
