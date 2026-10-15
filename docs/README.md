# ZovikPOS project guide

This folder describes the implemented application by user workflow and supporting system. It is based on the frontend routes, Express routes/controllers, Prisma schema, and Python service. The root `README.md` contains setup and feature claims that may not exactly match the current implementation; implementation notes below take precedence where they differ.

## Documents

- [Architecture and setup](architecture.md): application layers, local services, and configuration areas.
- [Customer ordering](customer-ordering.md): guest/customer entry, tables, sessions, cart, ordering, tracking.
- [Cashier and kitchen operations](counter-kitchen.md): counter POS, payment processing, live kitchen status.
- [Administration](administration.md): admin workspace and management capabilities.
- [Inventory and receiving](inventory.md): stock, recipes, receiving, batch expiry, suppliers, and logs.
- [AI and analytics](ai-analytics.md): implemented forecasting, ETA, OCR, and AI-assisted workflows.
- [Authentication and safeguards](security-access.md): roles, tokens, middleware, demo restrictions, and audit behavior.
- [API and data model](api-data-model.md): route groups and principal persisted entities.

## Roles at a glance

| Role | Main workspace | Main purpose |
|---|---|---|
| Customer | `/customer` | Browse menu, select a table, manage cart, order, and track |
| Vendor | `/cashier` (also `/vendor`) | Counter operations and staff inventory/payment workflows |
| Kitchen | `/kitchen` | Work the live order board and advance order status |
| Admin | `/admin` | Configure and monitor operational, staff, inventory, and reporting functions |

## Important implementation boundaries

- The Node/Express service is the primary API and Prisma persistence layer. Socket.IO provides live events.
- The Python FastAPI service implements `/predict` and `/predict-eta`; the Node application also has its own ETA controller and AI service integrations. Check the active controller configuration before assuming every screen calls Python.
- There is no dedicated reports API route group in `server.js`; some report/export work is performed in the frontend from fetched data.
- The Prisma datasource is configured as PostgreSQL, while this checkout includes a `backend/prisma/dev.db` file. The schema configuration and database URL determine the runtime database; do not infer the active database from the file's presence.
- Avoid placing credentials, API keys, or production connection strings in these docs. Use local environment files and rotate any credentials that were ever committed or shared.
