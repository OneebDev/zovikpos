# Customer ordering functionality

## Entry points

The React app routes `/` to `/customer`. Customer pages are `/customer`, `/customer/table/:tableId`, `/customer/cart`, and `/customer/track/:trackingToken`. Customer pages use the portal, cart, and tracking components under `frontend/src/pages/customer/`.

## Typical flow

1. A customer opens the portal, optionally arriving with table context from a table QR.
2. The portal loads active menu items and supports choosing a table/session.
3. Items and quantities are maintained in a session cart. The cart page supports reviewing and changing the selection.
4. The customer submits an order. The backend stores order-item snapshots (name and price at order time), totals, table/session references, and a tracking token.
5. The customer can use the tracking route/token to view current order status. Socket.IO events can update the interface while connected.

## Accounts and verification

The app supports guest customer state and email OTP endpoints (`/api/auth/send-otp`, `/api/auth/verify-otp`). Orders carry `customerEmail` and `emailVerified` fields. Whether a given ordering path requires OTP is governed by the customer components and API response flow, rather than the schema alone.

## Cart and session APIs

- `/api/sessions/start`, `/api/sessions/transfer-table`, `/api/sessions/:sessionId`, `/api/sessions/:sessionId/close`
- `/api/cart/:sessionId` and `/items` operations for read/add/update/remove/clear
- `/api/tables/active` for active table choices
- `/api/menu` for public menu reads
- `/api/orders` for order creation; `/api/orders/track/:token` for public tracking
- `/api/eta` for an order/cart preparation estimate

Cart routes apply session-activity middleware. The client also sends the stored customer session ID as `X-Session-ID` where available.

## Stored state

`Session` associates a table and optional customer with lifecycle timestamps/status. A `Cart` belongs to one session and contains `CartItem` rows. `Order` may link to a session, table, customer, and branch; `OrderItem` stores historical snapshots. `trackingToken` is unique and supports direct tracking links.

## Customer-facing limits

Online payment availability is obtained from `/api/payments/settings`; order/payment status may require cashier verification. Exact payment methods and checkout transitions are controlled by current frontend/backend logic and settings, not by this guide's examples.
