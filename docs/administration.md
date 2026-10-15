# Administration functionality

The admin shell is implemented by `AdminDashboard` and the shared admin layout/sidebar. Routes are under `/admin`; the frontend protects them by checking the locally restored user role, and the backend admin router separately requires authentication plus `ADMIN` role.

## Admin workspace sections

| Section | Route | Capability represented in code |
|---|---|---|
| Dashboard | `/admin` | Operational/revenue metrics and branch-aware overview |
| Orders | `/admin/orders` | Browse and manage orders |
| Payments | `/admin/payments` | Payment review/verification workflows |
| Menu | `/admin/menu` | Menu catalog and item maintenance |
| Inventory | `/admin/inventory` | Stock catalog and linked inventory views |
| Staff | `/admin/staff` | Staff creation, update, role/status changes, password reset, deletion |
| Customers | `/admin/customers` | Customer roster and account deletion |
| Tables & QR | `/admin/tables` | Tables and QR card management |
| Kitchen monitor | `/admin/kitchen` | Operational order monitoring |
| Payment availability | `/admin/payment-availability` | Configure enabled payment options |
| Notifications | `/admin/notifications` | Notifications/alerts view |
| AI insights | `/admin/ai-insights` | Forecast and inventory insights |
| Reports | `/admin/reports` | Reporting/export UI |
| Audit logs | `/admin/audit-logs` | Audit records and deletion tools |
| Order history | `/admin/order-history` | Order status transition history |
| Branches | `/admin/branches` | Branch listing, creation, and deletion |

## Backend admin API

`/api/admin` provides dashboard stats, audit logs, order status history, staff, customer, and branch endpoints. Its router applies `authMiddleware` and `roleMiddleware(['ADMIN'])` to every route. Other operational domains have their own routers and role controls; for example inventory and menu management also allow VENDOR users.

The admin layout includes branch selection, manual refresh, collapsible/mobile navigation, theme preference, and a demo status badge. Data filtering by branch depends on each view/controller implementing the selected branch parameter.

## Reports and exports

The UI includes sales, product, and inventory reporting surfaces and frontend export utilities. The server does not mount a separate `/api/reports` router; report datasets are sourced from existing endpoints. Demo restrictions may block exports in the UI.
