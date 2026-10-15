# API and data model reference

All API routes below are mounted under `/api` unless noted. Authentication/role requirements are summarized from route middleware; controller-level checks may add constraints.

## Route groups

| Group | Main endpoints | Access summary |
|---|---|---|
| Auth | `/auth/register`, `/login`, `/refresh-token`, `/send-otp`, `/verify-otp`, `/profile`, `/logout` | Login/OTP public with rate limits; profile/logout authenticated |
| Sessions | `/sessions/start`, `/transfer-table`, `/:id`, `/:id/close` | Start/transfer optionally authenticated; session lookup/close handlers apply their own validation |
| Cart | `/cart/:sessionId` and `/items` CRUD | Session activity checks; session-scoped |
| Tables | `/tables/active`, `/:id/qr`, `/qr/batch`, staff CRUD | QR/active reads public; staff reads Admin/Vendor; table mutation Admin |
| Menu | `/menu`, `/:id`, `/:id/qr`, item/image mutations | Reads public; writes Admin/Vendor |
| Orders | `/orders`, `/:id`, `/:id/status`, `/:id/transfer-table`, `/track/:token` | Tracking public; protected order APIs; writes/status have role constraints |
| Payments | `/payments/settings`, `/submit`, `/:id/verify` | Settings read public/optional auth; update and verify Admin/Vendor; submit authenticated |
| Inventory | `/inventory/*` | Router requires authenticated staff; most mutations Admin/Vendor; Kitchen has reads |
| Admin | `/admin/*` | Authenticated Admin only |
| ETA | `/eta` | Controller endpoint; route has no router-level auth middleware |

The health check is `GET /health` (outside `/api`).

## Principal entities

- Organization: `Branch`, `Table`.
- Identity and access: `User`, `Session`, `EmailOTP`.
- Catalog: `Category`, `MenuItem`.
- Customer ordering: `Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`.
- Kitchen timing/analytics: `ETAPrediction`, `DemandForecast`, `OrderStatusHistory`.
- Stock operations: `InventoryItem`, `RecipeItem`, `Supplier`, `InventoryReceiving`, `InventoryReceivingItem`, `InventoryLog`.
- Governance: `AuditLog`, `PaymentSetting`.

## State notes

Status fields are strings rather than Prisma enums. Order status comments enumerate values such as `PENDING`, `PAYMENT_PENDING`, `PAID`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`, `PAYMENT_FAILED`, and `REFUNDED`; payment status has a separate lifecycle. Receiving status is `DRAFT`, `RECEIVED`, or `CANCELLED`; session status includes active, checkout, completed, expired, and cancelled. Controller logic remains the authority for valid transitions.

Order items preserve names/prices as snapshots so later menu edits do not rewrite the historical sale. Inventory receiving lines and logs preserve batch/expiry details for receiving and usage history.
