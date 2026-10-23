# Cashier and kitchen operations

## Cashier workspace

The cashier route (`/cashier/*`, with `/vendor/*` as an alias) renders `CashierPOSPage` for users whose role is `VENDOR`. The UI supports counter sales and operational order handling. Backend capabilities include reading/updating orders, confirming/verifying payments, menu reads, table management for staff, and inventory work for ADMIN/VENDOR.

Payment endpoints include `/api/payments/settings`, `/api/payments/submit`, `/api/payments/:id/verify`, and PayFast gateway endpoints (`/api/payments/payfast/initiate`, `/api/payments/payfast/notify`). Admin/Vendor users can update payment availability settings and verify a transaction. Successful payment confirmation is part of the order lifecycle and inventory deduction is implemented by inventory services/controllers; consult those paths for the precise trigger and refund behavior.

## Kitchen workspace

The `/kitchen/*` route renders `KitchenBoardPage` for `KITCHEN` users. Orders are read from `/api/orders`; status changes use `/api/orders/:id/status`. The backend permits ADMIN, VENDOR, KITCHEN, and CUSTOMER roles on this status route, with transition validation and side effects handled by the order controller. Inventory management reads are available to Kitchen, while most inventory mutations are limited to Admin/Vendor.

## Live updates

The frontend maintains a persistent Socket.IO connection and joins with role/user identity. The server is initialized in `backend/src/sockets/socket.js`. Order, account, and operational events can be reflected without polling when the relevant client listener is mounted. Reconnection is enabled in the browser client.

## Related records

Orders include a current status, payment status/method, totals, optional table/session/branch and a status history. `OrderStatusHistory` records transitions and optional actor/note. `Payment` stores the amount, method, transaction ID, and status.
