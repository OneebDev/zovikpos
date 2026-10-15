# Inventory and receiving functionality

## Inventory catalog

Inventory items contain a name, category, optional SKU, stock level, unit, minimum/maximum thresholds, cost, optional supplier and branch. The unique constraint is branch plus name. Inventory endpoints are under `/api/inventory`; Admin, Vendor, and Kitchen can access the router, while mutation routes generally restrict writes to Admin/Vendor.

Capabilities exposed by the route/controller layer include summary/catalog, add/update/delete and bulk operations, stock-in/adjust/restock, alerts, logs, and per-item forecasts.

## Recipes and cost calculations

`RecipeItem` connects a menu item to an inventory item with a quantity and unit. Recipe endpoints support fetch/save/delete, bulk deletion, preset import, AI suggestions, and margin data. Unit conversion helpers support compatible ingredient/recipe units. Recipes support cost and margin views and provide ingredient quantities for order-related stock accounting.

## Receiving workflow

`InventoryReceiving` represents a draft/received/cancelled receiving document with supplier, invoice, branch, receiver, date, notes, total cost, and child lines. Receiving lines record quantity, remaining quantity, unit cost, batch, expiry, and notes. Routes support list/detail/reference generation, create/update, confirm, cancel, delete/bulk delete, spreadsheet preview, and OCR invoice preview.

Receiving previews are drafts: confirm the receiving to apply the actual stock-in workflow. Inventory logs can reference receiving documents and lines, batch identifiers, expiry dates, suppliers, and users.

## Batch freshness and suppliers

The API exposes expiring-item lists and batch-expiry update/clear operations, plus supplier create/update/delete/list endpoints. Batch metadata is represented on receiving lines and inventory logs. Avoid assuming a single `InventoryItem.expiryDate` captures all lots; use the receiving/log records for lot-level history.

## Inventory history

`InventoryLog` records a type, quantity before/after, change, optional cost/reason, order references, receiving references, batch/expiry details, supplier, and actor. Supported log types are documented in the schema comments (including stock-in, usage, wastage, adjustment, restoration). Log deletion endpoints exist, so the audit history should not be described as immutable.

## Useful endpoints

`GET /api/inventory`, `/summary`, `/alerts`, `/logs`, `/receivings`, `/expiring`, `/suppliers`, `/recipes/margins`; write operations are detailed in `api-data-model.md` and enforced by route middleware.
