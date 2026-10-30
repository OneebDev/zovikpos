# System Changelog & Modifications Tracker

This document tracks all architectural, database, backend, and frontend modifications made to the **AI-Powered POS** project. Future updates will be continuously appended to this log.

---

## [2026-10-31] Inventory Packaging, Unit Conversions & Multi-Unit Catalog Support

### 1. Database Schema & Multi-Unit Catalog Support (Option A)
- **File**: `backend/prisma/schema.prisma`
  - Changed uniqueness constraint on `InventoryItem` from `@@unique([branchId, name])` to:
    ```prisma
    @@unique([branchId, name, unit])
    ```
  - Allows items with the identical name but distinct Base Units (e.g., `Mozzarella Cheese [KG]` vs `Mozzarella Cheese [PACK]`) to co-exist in the database as separate catalog items.
  - Successfully synced database via `npx prisma db push --accept-data-loss`.

---

### 2. Backend Inventory Controllers & APIs
- **File**: `backend/src/controllers/inventoryController.js`
  - **`addInventoryItem`**: Duplicate check updated from checking only `name` to checking both `name` AND `unit` (case-insensitive).
  - **`bulkAddInventoryItems`**: Duplicate filter updated to check `name` AND `unit` so saving multiple items with same names but different base units creates new distinct items. Also ensures `packageConversions` are saved into Prisma create call.
  - **`getInventoryItems` (Deduplication Fix)**:
    - Fixed the deduplication logic that was previously merging items purely by name (`item.name.trim().toLowerCase()`).
    - Updated canonical key to `name + unit` (`${item.name}__${item.unit}`), ensuring that `Mozzarella Cheese [KG]` and `Mozzarella Cheese [PACK]` both return to the frontend and show in search dropdowns.

---

### 3. AI OCR & Invoice Matching Engine
- **File**: `backend/src/services/aiOcrService.js`
  - **Unit-Aware Invoice Matching**:
    - Updated `findBestFuzzyCatalogMatch(rawName, sku, catalogItems, itemUnit)` to accept `item.unit`.
    - When exact name match finds multiple catalog candidates (e.g. `Mozzarella Cheese` in both KG and PACK), it matches the item that matches the scanned invoice unit.
    - Prevents picking the wrong base unit record upon invoice upload.

---

### 4. Unit Conversion Engine
- **Files**:
  - `backend/src/utils/unitConverter.js`
  - `frontend/src/utils/unitConverter.js`
- **Package-to-Package Bridge (Step 3.4)**:
  - Added conversion bridge allowing package units (e.g., `BLOCK` to `PACK`) to convert accurately by converting through their common base unit (`KG`).
  - Added kitchen fallback (Step 3.5) for standard containers (PACK, BOTTLE, BLOCK, etc.) to fallback 1:1 if no custom conversion is specified.
  - Fixed reference bug where `conversionsObj` was incorrectly referencing undefined `conversions` in `resolvePackageFactor`.

---

### 5. Frontend UI & Form Flow Improvements
- **File**: `frontend/src/components/admin/views/AdminInventoryView.jsx`
  - **Card #1 & Additional Delivery Cards**:
    - Updated `isNewItem` matching logic to check both `name` and `unit`. Changing the unit dropdown from `PACK` to `KG` dynamically marks the item as `New Item`.
    - Added inline error banner for catalog duplicate conflicts with quick-action buttons:
      - **"Link to Existing"**: Locks the card to the existing catalog item and copies its unit.
      - **"Change Name"**: Clears error so user can input an alternative name.
    - Updated Edit Item Modal to permanently lock Base Unit (`Base Unit (Fixed) 🔒 Locked`) to maintain data integrity.

- **File**: `frontend/src/components/admin/views/AdminInventoryReceivingView.jsx`
  - Fixed `unmatchedCount` banner synchronization to strictly count rows with actual item names (`!row.inventoryItemId && String(row.searchTerm || '').trim()`), avoiding phantom counts from empty rows.
  - Connected `handleSaveAllNewItemsInCatalog` to accept `reviewedItemsOverride` to eliminate stale React closures.
  - Added `<ReviewSubUnitsModal />` component to the view's render tree so sub-unit confirmations open on Confirm, Draft Save, and Save New Items.
  - Added persistence for sub-unit conversions on reviewed existing items.

- **File**: `frontend/src/components/admin/common/ReviewSubUnitsModal.jsx`
  - Replaced all Roman Urdu text with professional English.
  - Added permanent lock badge (`🔒 Base Unit: <UNIT>`) for existing catalog items.
  - Dropdown selector remains active for brand new items.
  - Clear contextual warning: *"Receiving as [UNIT] while catalog Base Unit is [UNIT]. Please confirm the packaging conversion factor below."*

---


### 6. Autocomplete Live Catalog Merge & In-Form Update Feature
- **File**: `frontend/src/components/admin/views/AdminInventoryView.jsx`
  - **Live Catalog Autocomplete**:
    - Add Form dropdown now merges real database catalog items (`inventory`) with hardcoded presets, allowing custom items and same-name items with distinct units (e.g., `Mozzarella Cheese [PACK]` and `Mozzarella Cheese [KG]`) to appear directly in the suggestion list.
    - Added `Mozzarella Cheese (Pack)` preset to `INGREDIENT_PRESETS`.
    - Dropdown `✓ In Stock` badge now validates exact match against both `name` AND `unit`.
  - **Catalog Details Auto-load**:
    - Selecting or typing an existing catalog item now auto-fills its `costPrice`, `unit`, `category`, and `packageConversions` directly from the database into the card fields.
  - **Dynamic "Update Catalog" Action**:
    - When an item is already in catalog (`IN CATALOG`), the green action button dynamically converts to a blue **"Update Catalog"** button.
    - Allows direct updates to cost price, category, and packaging sub-units without having to navigate to the separate catalog table.
  - **Crash Prevention**:
    - Resolved `ReferenceError: AlertCircle is not defined` by importing `AlertCircle` from `lucide-react`, ensuring smooth inline error rendering when catalog name conflicts occur.

---
