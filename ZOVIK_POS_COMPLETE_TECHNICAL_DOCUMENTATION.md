# ZOVIK POS — Complete Project Reverse Engineering & Technical Documentation

> **Status:** Production-Grade Technical Reverse Engineering & Verification Audit  
> **Target Audience:** Software Engineers, System Architects, Technical Evaluators, and AI Coding Assistants  
> **Inspection Mode:** Non-Destructive, Static Codebase & Architectural Analysis  
> **Date of Audit:** October 25, 2026  

---

## 📋 Table of Contents

1. [PART 1 — Project Overview and Purpose](#part-1--project-overview-and-purpose)
2. [PART 2 — Technology Stack](#part-2--technology-stack)
3. [PART 3 — Repository and Folder Structure](#part-3--repository-and-folder-structure)
4. [PART 4 — System Architecture](#part-4--system-architecture)
5. [PART 5 — User Roles and Permissions](#part-5--user-roles-and-permissions)
6. [PART 6 — Complete Module-by-Module Documentation](#part-6--complete-module-by-module-documentation)
   - [A. Authentication and Customer Verification](#a-authentication-and-customer-verification)
   - [B. Customer Portal & QR Dining Flow](#b-customer-portal--qr-dining-flow)
   - [C. QR Codes, Tables, and Dining Sessions](#c-qr-codes-tables-and-dining-sessions)
   - [D. Menu Management Engine](#d-menu-management-engine)
   - [E. Orders and Order Lifecycle](#e-orders-and-order-lifecycle)
   - [F. Payment Systems & Integrations](#f-payment-systems--integrations)
   - [G. Cashier / Vendor Counter POS Terminal](#g-cashier--vendor-counter-pos-terminal)
   - [H. Kitchen Display System (KDS)](#h-kitchen-display-system-kds)
   - [I. Inventory Management & Recipe Mapping](#i-inventory-management--recipe-mapping)
   - [J. Automated Inventory Receiving (OCR, AI Vision & Excel)](#j-automated-inventory-receiving-ocr-ai-vision--excel)
   - [K. Admin Dashboard, Analytics & Financial Intelligence](#k-admin-dashboard-analytics--financial-intelligence)
   - [L. Customer Management, Blocking & Disputes](#l-customer-management-blocking--disputes)
   - [M. Transactional Email & Notification Subsystem](#m-transactional-email--notification-subsystem)
   - [N. Audit Logging & Order Status History](#n-audit-logging--order-status-history)
   - [O. Machine Learning & Artificial Intelligence Subsystems](#o-machine-learning--artificial-intelligence-subsystems)
7. [PART 7 — Exact Business Logic and Rules](#part-7--exact-business-logic-and-rules)
8. [PART 8 — Database Schema and Relationships](#part-8--database-schema-and-relationships)
9. [PART 9 — API Route & Controller Reference](#part-9--api-route--controller-reference)
10. [PART 10 — Frontend Pages, Views, and UI Components](#part-10--frontend-pages-views-and-ui-components)
11. [PART 11 — Real-Time WebSocket Event & Notification Map](#part-11--real-time-websocket-event--notification-map)
12. [PART 12 — Environment Configuration and Deployment](#part-12--environment-configuration-and-deployment)
13. [PART 13 — Current Known Issues and Technical Risks](#part-13--current-known-issues-and-technical-risks)
14. [PART 14 — Tests and Verification Status](#part-14--tests-and-verification-status)
15. [PART 15 — Complete End-to-End User Flows](#part-15--complete-end-to-end-user-flows)
16. [PART 16 — Dependency and Change Impact Map](#part-16--dependency-and-change-impact-map)
17. [PART 17 — Final Project Summary for Another AI Assistant](#part-17--final-project-summary-for-another-ai-assistant)

---

# PART 1 — Project Overview and Purpose

### 1.1 What ZOVIK POS Is
**ZOVIK POS** is a distributed, full-stack, enterprise-grade Point of Sale (POS) and Intelligent Inventory Management platform engineered specifically for university canteens, high-turnover food courts, and multi-branch food enterprises. Developed initially as a Final Year Project (FYP 2026), it integrates real-time dining session state machines, kitchen workflow management, atomic raw ingredient depletion, multi-key vision OCR document ingestion, and machine learning models for demand forecasting and kitchen preparation time estimation.

### 1.2 What Problem It Solves
Traditional food court and canteen operations suffer from:
1. **Severe Counter Congestion:** Long queues during lunch peak hours where cashiers manually take orders, calculate bills, and print paper tokens.
2. **Untracked Stock Leakage & Wastage:** Inability to know exact raw ingredient usage per dish sold, leading to unrecorded shrinkages, stockouts during rushes, and undetected inventory theft.
3. **Manual Invoice Data Entry Overhead:** Receiving physical supplier paper bills, handwritten receipts, and Excel manifests requires tedious manual data entry that is error-prone.
4. **Kitchen Bottlenecks & Missing Wait Time Clarity:** Disconnection between incoming customer orders and kitchen preparation queues leads to misplaced orders and frustrated diners unaware of their true wait time.
5. **Campus Identity & Uncollected Food Abuse:** Guest customers placing bogus orders or failing to collect cash-on-delivery orders.

ZOVIK POS resolves these pain points through:
- **HMAC-Secured Table QR Ordering:** Customers scan an active physical table QR code with their mobile devices, verify via campus email OTP, customize orders, and pay online or at the counter.
- **Atomic Recipe-Based FIFO Stock Deduction:** Dishes sold trigger automatic conversions (e.g. grams to kilograms) and decrement raw stock in PostgreSQL transactions using First-In, First-Out (FIFO) receiving batch tracking.
- **Multimodal AI Invoice Digitization:** Staff upload camera photos or PDFs of vendor delivery bills; Groq AI Vision parses items, quantities, costs, batch codes, and expiries, matching them against catalog items with phonetic and fuzzy algorithms.
- **Bi-Directional Real-Time Sockets:** WebSockets synchronize changes instantly across customer tracking screens, kitchen bump bars, cashier POS terminals, and executive dashboards.
- **Strict Campus Domain Verification:** Customer verification strictly enforces UIT student domains (`<roll_number>@students.uitu.edu.pk`).

### 1.3 Intended Users and Business Environment
- **Primary Institution:** University cafeteria / canteen environment (specifically designed around Usman Institute of Technology - UIT University campus conventions).
- **Secondary Environment:** Quick Service Restaurants (QSR), food courts, and multi-branch commercial cafeterias.
- **Users:**
  - **Enrolled Students & Campus Diners:** Access customer portal via table QR codes.
  - **Counter Cashiers / Food Vendors:** Front-of-house staff running counter billing, accepting cash payments, verifying online wallet transfers, and handling walk-in orders.
  - **Kitchen Line Staff / Chefs:** Back-of-house staff operating the Kitchen Display System (KDS) bump bar.
  - **Cafeteria Managers / System Administrators:** Executive operators overseeing revenue, profit margins, recipe food costing, menu availability, stock receiving, staff provisioning, customer disputes, and audit trails.

### 1.4 Main User Roles and Scope

| Role | Default Landing Path | Authentication Method | Primary Operational Scope |
|---|---|---|---|
| **CUSTOMER** | `/customer` | Email OTP (Restricted to `@students.uitu.edu.pk`) | Scans physical table QR code, claims dining session, manages cart, places COD / Online orders, live socket tracking, submits disputes. |
| **VENDOR** (Cashier) | `/cashier` | Email + Password JWT | Walk-in counter POS order creation, order queue retrieval, cash collection, wallet transfer verification, payment toggle settings, basic stock adjustments. |
| **KITCHEN** | `/kitchen` | Email + Password JWT | Live Kitchen Display System (KDS), audio alert monitoring, preparation status bumping (`PAID` → `PREPARING` → `READY` → `SERVED`). |
| **ADMIN** | `/admin` | Email + Password JWT | Full administrative command: revenue metrics, profit margin engine, menu item CRUD, recipe food cost mappings, multi-branch switching, Excel/OCR stock inwarding, batch expiry tracking, customer block/unblock, staff management, audit trail. |
| **DEMO SANDBOX** | `/admin/login` | Email: `demo.admin@testpos.local` | Full visual inspection of Admin capabilities with mutation guards (`POST`, `PUT`, `PATCH`, `DELETE` and file exports blocked). |

### 1.5 Module Implementation Status

```
[Implemented & Fully Functional]
 ├── Authentication & RBAC (JWT + Refresh Tokens + Audit Logging)
 ├── Student Email OTP Verification (6-digit, 5-min TTL, UIT regex matching)
 ├── HMAC Table QR Code Generation & Cryptographic Verification
 ├── Customer Table Session Lifecycle (10-min idle auto-expiry sweep)
 ├── Menu Catalog Engine & Supabase Image Ingestion
 ├── Real-Time Kitchen Display System (KDS) with Status Bumping & Audio
 ├── Counter POS Terminal with Walk-In & Table Order Processing
 ├── Automatic Recipe-Based FIFO Inventory Deduction & Restoration
 ├── Goods Received Note (GRN) Inwarding (Manual, Excel XLSX, AI Vision OCR)
 ├── Batch Expiry & Freshness Tracking (Days left countdown)
 ├── Multi-Key & Multi-Model Groq AI Failover Matrix
 ├── Admin Financial Analytics, Costs & Margins Engine
 ├── Customer Roster, Account Blocking & Dispute Management
 └── Transactional Nodemailer Email Engine (OTP, Confirmation, Ready, Receipts)

[Partially Implemented / Hybrid]
 ├── PayFast Hosted Sandbox Integration (Webhook handler present; initiate endpoint field mismatch bug present)
 ├── AI Demand Forecasting (Synthetic rule-based model with actual data overlay)
 ├── AI ETA Prediction (Synthetic RandomForest training at service boot with math formula fallback)
 └── Multi-Branch Architecture (Database models branch-aware; frontend views partially toggle branch filtering)

[Disabled / Future Hardening / Not Implemented]
 ├── Least-Privilege DB Runtime Roles (`pos_app` vs `pos_migrator` documented but deferred)
 ├── Native Customer Wallet / In-App Balance System (Customers pay via COD, JazzCash, Easypaisa, or PayFast)
 └── Dedicated Reports API Routes (Reports generated client-side from aggregated endpoints)
```

---

# PART 2 — Technology Stack

The stack was verified by directly inspecting [`backend/package.json`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/package.json), [`frontend/package.json`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/package.json), and [`ai-service/requirements.txt`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/ai-service/requirements.txt).

```
                      ZOVIK POS TECHNOLOGY RUNTIMES
 ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
 │        FRONTEND         │  │         BACKEND         │  │       AI SERVICE        │
 │  React 19.2.6           │  │  Node.js >= 20.0.0       │  │  Python 3.12.9          │
 │  Vite 8.0.12            │  │  Express 4.18.2          │  │  FastAPI 0.110.0        │
 │  React Router 7.18.2    │  │  Prisma ORM 5.10.2       │  │  Uvicorn 0.28.0         │
 │  TanStack Query 5.102.8 │  │  Socket.IO 4.7.4         │  │  scikit-learn 1.4.1.post│
 │  Recharts 3.8.1         │  │  PostgreSQL (pg 8.23.0)  │  │  pandas 2.2.1           │
 │  TailwindCSS 4.3.0      │  │  ioredis 5.11.1          │  │  NumPy 1.26.4           │
 └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

### Detailed Component Inventory

| Category | Technology | Version | Location Used | Purpose & Verification Notes |
|---|---|---|---|---|
| **Frontend Framework** | React | `19.2.6` | `frontend/` | UI rendering. Modern React 19 architecture using Hooks, Context, Suspense, and React Portals. |
| **Frontend Bundler** | Vite | `8.0.12` | `frontend/vite.config.js` | Fast HMR dev server and optimized production Rollup bundling. |
| **Client Routing** | React Router DOM | `7.18.2` | `frontend/src/App.jsx` | Declarative client routing, URL parameter extraction, and role guards. |
| **Server State Sync** | TanStack React Query | `5.102.8` | `frontend/src/` | Cached query management for menus, orders, inventory, and stats. |
| **UI Icons** | Lucide React | `1.16.0` | `frontend/src/` | Comprehensive icon set across all portals. |
| **Data Visualization** | Recharts | `3.8.1` | `AdminHomeView.jsx`, `AdminReportsView.jsx` | Renders revenue breakdowns, hourly order distributions, and category margins. |
| **In-App QR Scanning**| html5-qrcode | `2.3.8` | `InAppQRScanner.jsx` | Allows customer mobile browser camera to scan physical table QR codes directly. |
| **Styling & Design** | TailwindCSS + CSS Custom Properties | `4.3.0` | `frontend/src/styles/` | Custom glassmorphism dark/light design system (`glass-theme.css`, `tokens.css`). |
| **Backend Runtime** | Node.js | `>=20.0.0` | `backend/` | Primary REST and WebSocket API runtime. |
| **Backend Framework** | Express.js | `4.18.2` | `backend/src/server.js` | HTTP routing, JSON parsing, middleware pipeline. |
| **Database Engine** | PostgreSQL | `15/16/18` | Cloud / Localhost | Relational transactional database. |
| **Database ORM** | Prisma | `5.10.2` | `backend/prisma/` | Type-safe schema definition, migration management, and parameterized querying. |
| **Real-Time Engine** | Socket.IO | `4.7.4` | `backend/src/sockets/socket.js` | Bi-directional WebSocket communication with room multiplexing (`branchId`, `tableId`). |
| **Distributed Cache** | Redis / ioredis | `5.11.1` | `backend/src/config/redis.js` | Shared rate-limiting counter backend. Gracefully degrades to in-memory sliding window when absent. |
| **Security & JWT** | jsonwebtoken | `9.0.2` | `authController.js`, `authMiddleware.js` | Dual-token auth architecture (7-day access token, 30-day refresh token). |
| **Password Hashing** | bcryptjs | `2.4.3` | `authController.js` | 10-round salted password hashing. |
| **Input Validation** | Zod | `3.24.2` | `backend/src/schemas/apiSchemas.js` | Strict runtime schema parsing for orders, menu items, receivings, and auth payloads. |
| **Email Delivery** | Nodemailer | `8.0.10` | `backend/src/services/emailService.js` | SMTP transport (Hostinger SMTP in production, Gmail app passwords locally). |
| **Spreadsheet Parsing**| xlsx (SheetJS) | `0.18.5` | `backend/src/services/aiOcrService.js` | Parses supplier vendor Excel spreadsheets (`.xlsx`, `.xls`, `.csv`). |
| **PDF Extraction** | pdf-parse | `2.4.5` | `backend/src/services/aiOcrService.js` | Extracts raw text from uploaded PDF invoices. |
| **Client OCR Engine**| Tesseract.js | `7.0.0` | `backend/src/services/groqService.js` | Fallback OCR worker for extracting text from noisy invoice images. |
| **Multimodal LLM** | Groq Cloud API | External REST | `backend/src/services/groqService.js` | Multi-key round-robin rotation invoking `qwen/qwen3.8-27b` (Vision), `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `allam-2-7b`. |
| **Cloud Object Storage**| @supabase/supabase-js | `2.116.0` | `backend/src/config/supabaseClient.js` | Dedicated exclusively to menu dish image uploads (`Menu Images` bucket). Database/Auth features are decommissioned. |
| **Payment Gateway** | PayFast (South Africa) | Custom integration | `backend/src/services/payfastService.js` | MD5 cryptographic signature generation and ITN webhook validation for hosted checkout. |
| **Python AI Engine** | FastAPI + Uvicorn | `0.110.0` / `0.28.0` | `ai-service/` | Python microservice serving `/predict` (demand) and `/predict-eta` (prep time). |
| **ML Framework** | scikit-learn + pandas | `1.4.1.post1` / `2.2.1`| `ai-service/main.py`, `model.py` | RandomForestRegressor for ETA calculations; rule-weighted feature matrix for demand forecasting. |

---

# PART 3 — Repository and Folder Structure

```
zovikposv1/
├── ARCHITECTURE.md                  # Comprehensive architectural overview document
├── DEPLOY-CHECKLIST.md              # Deployment operational verification checklist
├── DEPLOYMENT-GUIDE.md              # Step-by-step production deployment manual
├── DEPLOYMENT.md                    # Database sizing, pool allocation and Redis notes
├── LOCAL-SETUP.md                   # Developer machine quickstart instructions
├── LOGGING.md                       # Syslog / BetterStack drain configuration manual
├── README.md                        # Master executive overview and feature catalogue
├── docs/                            # Deep-dive design specifications
│   ├── administration.md            # Admin workspace feature documentation
│   ├── ai-analytics.md              # AI, ML models, and predictive workflow specs
│   ├── api-data-model.md            # Endpoint groups and schema entities
│   ├── architecture.md              # Application layers and request flow
│   ├── counter-kitchen.md           # Cashier POS and KDS workflows
│   ├── customer-ordering.md         # QR scanning, session claiming, ordering specs
│   ├── inventory.md                 # Recipes, deductions, receiving, and expiry specs
│   ├── README.md                    # Directory navigation index
│   └── security-access.md           # Roles, middleware, demo lockdown, audit details
├── ai-service/                      # Python FastAPI ML Microservice (Port 8000)
│   ├── canteen_orders.csv           # Historical sample order training data
│   ├── eta_model.pkl                # Pre-trained serialised ETA regression model
│   ├── exception_logger.py          # Structured error and audit logger
│   ├── main.py                      # FastAPI application entrypoint & ETA endpoints
│   ├── model.py                     # Rule-based demand forecasting logic
│   ├── requirements.txt             # Python runtime dependencies
│   ├── runtime.txt                  # Python runtime specification (python-3.12.9)
│   └── train_model.py               # Standalone training script for ETA models
├── backend/                         # Node.js Express & Prisma API (Port 5001)
│   ├── eng.traineddata              # Tesseract OCR offline model file
│   ├── Procfile                     # Heroku deployment release phase & web process
│   ├── DEPLOYMENT-DB-ROLES.md       # Planned least-privilege PostgreSQL access plan
│   ├── prisma/
│   │   ├── schema.prisma            # Canonical Prisma database schema (17 models)
│   │   ├── seed.js                  # Initial system users & branch seed script
│   │   └── seed_canteen_menu.js     # UIT canteen menu items and categories seed
│   ├── scripts/
│   │   ├── checkEmailPreviews.js    # CLI validator for email template HTML output
│   │   ├── renderEmailPreviews.js   # HTML preview generator for email templates
│   │   └── send-test-email.js       # Diagnostic SMTP transport verification script
│   ├── src/
│   │   ├── server.js                # Express app, HTTP server, Sockets, Top middleware
│   │   ├── config/
│   │   │   ├── db.js                # PrismaClient instance with pool overrides
│   │   │   ├── redis.js             # ioredis client with timeout wrappers
│   │   │   └── supabaseClient.js    # Supabase Client for Image Object Storage
│   │   ├── controllers/
│   │   │   ├── adminController.js   # Analytics, staff, branches, customers, disputes
│   │   │   ├── authController.js    # Passwords, JWT tokens, OTP issuance & verification
│   │   │   ├── cartController.js    # Server-side cart mutations & price calculations
│   │   │   ├── etaController.js     # ETA calculation & AI proxy dispatch
│   │   │   ├── inventoryController.js # Stock catalogue, recipes, suppliers, logs
│   │   │   ├── inventoryReceivingBatchController.js # Bulk receiving & GRN ledger
│   │   │   ├── menuController.js    # Dishes, variants, category management
│   │   │   ├── orderController.js   # Order placement, status transitions, cancellations
│   │   │   ├── paymentController.js # Cashier billing, wallet verification, PayFast
│   │   │   ├── sessionController.js # QR token validation, dining session state
│   │   │   └── tableController.js   # Dining tables CRUD & HMAC QR generation
│   │   ├── middleware/
│   │   │   ├── auditMiddleware.js   # Centralised audit trail database logger
│   │   │   ├── authMiddleware.js    # JWT bearer token verification
│   │   │   ├── corsPolicy.js        # Strict dynamic CORS origin checker
│   │   │   ├── demoGuardMiddleware.js # Mutation blocker for demo evaluation accounts
│   │   │   ├── idempotencyMiddleware.js # Prevents duplicate POST/PUT transactions
│   │   │   ├── rateLimitMiddleware.js # Tiered Redis / in-memory rate limiters
│   │   │   ├── requestTimeout.js    # 25-second server-wide request execution guard
│   │   │   ├── roleMiddleware.js    # Role-based access control (RBAC) guard
│   │   │   ├── sessionActivityMiddleware.js # Customer dining idle touch renewer
│   │   │   └── validate.js          # Zod schema validation middleware
│   │   ├── routes/
│   │   │   ├── adminRoutes.js       # `/api/admin/*`
│   │   │   ├── authRoutes.js        # `/api/auth/*`
│   │   │   ├── cartRoutes.js        # `/api/cart/*`
│   │   │   ├── etaRoutes.js         # `/api/eta/*`
│   │   │   ├── inventoryRoutes.js   # `/api/inventory/*`
│   │   │   ├── menuRoutes.js        # `/api/menu/*`
│   │   │   ├── orderRoutes.js       # `/api/orders/*`
│   │   │   ├── paymentRoutes.js     # `/api/payments/*`
│   │   │   ├── sessionRoutes.js     # `/api/sessions/*`
│   │   │   └── tableRoutes.js       # `/api/tables/*`
│   │   ├── schemas/
│   │   │   └── apiSchemas.js        # Canonical Zod request body validation schemas
│   │   ├── services/
│   │   │   ├── aiOcrService.js      # Invoice OCR, XLSX ingestion, fuzzy matching
│   │   │   ├── aiService.py / js    # Node proxy client to Python ML service
│   │   │   ├── aliasService.js      # Urdu/English phonetic dictionary matching
│   │   │   ├── apiIdempotencyCleanup.js # Background cleaner for expired locks
│   │   │   ├── disputeService.js    # Raw SQL dispute management fallback service
│   │   │   ├── emailService.js      # Nodemailer transactional email delivery
│   │   │   ├── emailTemplateHelpers.js # Reusable HTML/CSS email templates
│   │   │   ├── etaService.js        # Kitchen load & queue length aggregator
│   │   │   ├── groqService.js       # Multi-key Groq Vision & LLM failover engine
│   │   │   ├── inventoryDeductionService.js # Atomic FIFO stock deduction & rollback
│   │   │   ├── payfastService.js    # PayFast MD5 signature generator & ITN validator
│   │   │   ├── qrSecurityService.js # HMAC-SHA256 signing for QR tokens
│   │   │   └── sweepJob.js          # Scheduled cleaner for abandoned sessions/orders
│   │   ├── sockets/
│   │   │   └── socket.js            # Socket.IO connection manager & room emitters
│   │   └── utils/
│   │       ├── categoryHelper.js    # Keyword classifier mapping items to categories
│   │       ├── dbRetry.js           # PostgreSQL deadlock retry wrapper (`40P01`)
│   │       ├── exceptionLogger.js   # Redacted structured JSON logging to stdout
│   │       ├── generateQRCode.js    # Server-side QR SVG / DataURL generator
│   │       ├── money.js             # Financial rounding utility to 2 decimal places
│   │       ├── sessionActivity.js   # Idle detection for dining sessions
│   │       ├── sessionSecurity.js   # Cryptographic session secret hashing
│   │       ├── statusValues.js      # System-wide enum allow-lists & validators
│   │       ├── tableLabel.js        # Formatting helper for display table numbers
│   │       └── unitConverter.js     # Conversion engine (KG, G, L, ML, PCS, DOZEN)
│   ├── test/                        # Node.js native unit & integration test suites
│   │   ├── adminStaffNoSupabase.test.js
│   │   ├── dbRetry.test.js
│   │   ├── idempotency.test.js
│   │   ├── money.test.js
│   │   ├── orderCartCaps.test.js
│   │   ├── rateLimitTiers.test.js
│   │   ├── realPostgres.sessionHardening.test.js
│   │   ├── requestTimeout.test.js
│   │   ├── routeValidation.test.js
│   │   ├── sessionHardening.test.js
│   │   ├── sessionSecurity.test.js
│   │   ├── statusValues.test.js
│   │   ├── unitConverter.test.js
│   │   ├── uploadImage.test.js
│   │   └── validation.test.js
│   └── tests/
│       └── inventoryReceivingBatch.test.js
└── frontend/                        # React 19 Vite Single Page Application (Port 5173)
    ├── index.html                   # HTML entrypoint with viewport & theme-color tags
    ├── vercel.json                  # Single Page Application rewrite rules
    ├── vite.config.js               # Vite build configuration with Tailwind plugins
    └── src/
        ├── App.jsx                  # Main router, global auth state, socket bootstrap
        ├── main.jsx                 # React root injection with BrowserRouter
        ├── components/
        │   ├── AdminDashboard.jsx   # Legacy/Composite admin view wrapper
        │   ├── CustomerDashboard.jsx# Core customer ordering interface
        │   ├── DemoRestrictionModal.jsx # Read-only demo warning modal
        │   ├── DemoStatusBadge.jsx  # Floating banner indicating Demo Sandbox Mode
        │   ├── FAQModal.jsx         # In-app help & ordering guidelines modal
        │   ├── InAppQRScanner.jsx   # HTML5 camera scanner component
        │   ├── KitchenDashboard.jsx # KDS kitchen order queue bump bar
        │   ├── Login.jsx            # Generic credential login component
        │   ├── PhoneInput.jsx       # Pakistani (+92) formatted phone input
        │   ├── RoleChangeModal.jsx  # Live socket alert when account status changes
        │   ├── RoleLogin.jsx        # Portal selector & staff login card
        │   ├── StaffLogin.jsx       # Specialized staff credential modal
        │   ├── VendorDashboard.jsx  # Cashier POS terminal interface
        │   ├── admin/               # Specialized Admin Dashboard Views
        │   │   ├── AdminLayout.jsx  # Responsive shell with floating navigation rail
        │   │   ├── AdminSidebar.jsx # Categorized navigation sidebar
        │   │   └── views/           # Modular view components (22 distinct views)
        │   ├── common/              # Shared UI components (Modals, Selects, BrandLogo)
        │   └── ui/                  # Primitives (Button, Chip, ModalShell, Skeleton)
        ├── hooks/
        │   ├── useCustomerActiveOrders.js # Real-time customer active order listener
        │   ├── useCustomerMenu.js   # Menu fetching, caching & search filter hook
        │   └── usePendingActions.js # Optimistic action coordinator
        ├── pages/
        │   ├── admin/AdminDashboardPage.jsx # Route entrypoint for `/admin/*`
        │   ├── cashier/CashierPOSPage.jsx   # Route entrypoint for `/cashier/*`
        │   ├── customer/            # Customer Portal pages
        │   │   ├── CustomerCartPage.jsx     # Checkout, payment selection & ordering
        │   │   ├── CustomerPortalPage.jsx   # Scanned table menu browsing landing
        │   │   └── OrderTrackingPage.jsx    # Real-time WebSocket order tracking
        │   └── kitchen/KitchenBoardPage.jsx # Route entrypoint for `/kitchen/*`
        ├── services/
        │   ├── api.js               # Axios instance with JWT interceptors & refresh
        │   ├── etaService.js        # Frontend client for ETA prediction API
        │   └── socket.js            # Socket.IO client manager with reconnect logic
        ├── styles/                  # Design tokens, glassmorphism CSS, animations
        └── utils/                   # Client-side formatting, currency, and unit helpers
```

---

# PART 4 — System Architecture

### 4.1 System Architectural Interactions

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Layer (Browser / Mobile PWA)"]
        Customer["Customer Portal<br>(Table QR / Mobile)"]
        Cashier["Cashier / POS Terminal<br>(Desktop / Tablet)"]
        Kitchen["Kitchen Bump Bar<br>(Kitchen Display Tablet)"]
        Admin["Executive Admin Console<br>(Desktop Workstation)"]
    end

    subgraph GatewayLayer ["Network & Edge Security"]
        VercelCDN["Vercel CDN / Static Host"]
        HerokuRouter["Heroku Edge Router / SSL Handshake"]
        RateLimiter["Sliding Window Rate Limiter<br>(Redis / In-Memory)"]
        ReqTimeout["25s Request Timeout Guard"]
    end

    subgraph BackendCore ["Backend Application Server (Node.js 20 + Express)"]
        AuthModule["Auth & RBAC<br>(JWT + Refresh + OTP)"]
        OrderModule["Order Engine & State Machine"]
        PaymentModule["Payment Processor<br>(Cash / Wallet / PayFast)"]
        InventoryModule["FIFO Batch Inventory Engine"]
        SocketServer["Socket.IO Real-Time Server"]
        AuditService["Structured Audit Logger"]
    end

    subgraph PersistenceLayer ["Persistence & External Services"]
        PG[(PostgreSQL Primary DB<br>Heroku / Localhost)]
        RedisStore[(Redis Shared Cache)]
        FastAPI["Python ML Service<br>(FastAPI Port 8000)"]
        GroqCloud["Groq Cloud LLM / Vision<br>(Multi-Key Failover)"]
        SupabaseStorage["Supabase Object Storage<br>(Menu Images Bucket)"]
        SMTPServer["SMTP Mail Server<br>(Hostinger / Gmail)"]
        PayFastGateway["PayFast Sandbox Gateway"]
    end

    Customer --> VercelCDN
    Cashier --> VercelCDN
    Kitchen --> VercelCDN
    Admin --> VercelCDN

    Customer --> HerokuRouter
    Cashier --> HerokuRouter
    Kitchen --> HerokuRouter
    Admin --> HerokuRouter

    HerokuRouter --> ReqTimeout --> RateLimiter
    RateLimiter --> AuthModule
    RateLimiter --> OrderModule
    RateLimiter --> PaymentModule
    RateLimiter --> InventoryModule
    RateLimiter --> SocketServer

    BackendCore --> PG
    RateLimiter -.-> RedisStore
    OrderModule --> FastAPI
    InventoryModule --> GroqCloud
    BackendCore --> SupabaseStorage
    AuthModule --> SMTPServer
    OrderModule --> SMTPServer
    PaymentModule --> PayFastGateway
    SocketServer <==> ClientLayer
```

### 4.2 Data Flow Diagrams

#### Diagram 1: Request Processing & Database Deadlock Wrapper
All database mutations that alter order statuses and deplete inventory pass through the `withDeadlockRetry` wrapper:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend Client
    participant Express as Express Route Handler
    participant Retry as withDeadlockRetry Wrapper
    participant Prisma as Prisma Client Transaction
    participant DB as PostgreSQL Database
    participant Sockets as Socket.IO Emitter

    Client->>Express: POST /api/payments/verify/:id (Approve)
    Express->>Retry: Execute Transaction Function
    loop Attempt 1 to 5
        Retry->>Prisma: $transaction(runDeduction, TX_OPTIONS)
        Prisma->>DB: SELECT * FROM "Order" WHERE id = X FOR UPDATE
        Prisma->>DB: UPDATE "Order" SET status = 'PAID'
        Prisma->>DB: SELECT id FROM "InventoryItem" ORDER BY id ASC FOR UPDATE
        Prisma->>DB: UPDATE "InventoryItem" SET stockLevel = stockLevel - qty
        Prisma->>DB: INSERT INTO "InventoryLog" (USAGE)
        alt Success (Commit)
            DB-->>Prisma: Transaction Committed
            Prisma-->>Retry: Transaction Result
        else PostgreSQL Error 40P01 / 40001 (Deadlock / Serialization)
            DB-->>Prisma: Deadlock Detected
            Prisma-->>Retry: Throws Transient DB Error
            Retry->>Retry: Exponential Jitter Backoff (50ms - 400ms)
        end
    end
    Retry-->>Express: Confirmed Updated Order
    Express->>Sockets: emitToKitchen('order:new'), emitToUser('order:update')
    Express-->>Client: HTTP 200 OK (Order payload)
```

#### Diagram 2: Order Lifecycle & FIFO Inventory Stock Deduction
When an order transitions to `PAID`, `inventoryDeductionService.js` decrements raw inventory:

```mermaid
flowchart TD
    StartOrder([Order Status Transition: PAID]) --> CheckLog{Usage Log Exists<br>for Order?}
    CheckLog -- Yes (Idempotent) --> SkipDeduction[Log message & skip duplicate deduction]
    CheckLog -- No --> FetchRecipes[Fetch MenuItem RecipeItems & Target Inventory Items]
    FetchRecipes --> SortLocks[Sort InventoryItem IDs ASC<br>Execute SELECT ... FOR UPDATE]
    SortLocks --> DecrementDisplay[Decrement MenuItem Front-End Display Stock]
    DecrementDisplay --> LoopItems[Iterate Recipe Items]
    LoopItems --> UnitConv[Convert Recipe Unit to Inventory Unit<br>e.g. 150g -> 0.15kg]
    UnitConv --> CheckBatches{Receiving Batches<br>Available with remainingQuantity > 0?}
    CheckBatches -- Yes --> FIFO[_fifoBatchDeduct: Consume Oldest Batch First]
    FIFO --> UpdateBatchRem[Decrement remainingQuantity on InventoryReceivingItem]
    UpdateBatchRem --> LogBatchUsage[Create InventoryLog USAGE with receivingItemId & batchNumber]
    CheckBatches -- No --> DecItemStock[Decrement InventoryItem.stockLevel directly]
    DecItemStock --> LogDirectUsage[Create InventoryLog USAGE without batch reference]
    LogBatchUsage --> CheckMore{More Recipe Items?}
    LogDirectUsage --> CheckMore
    CheckMore -- Yes --> LoopItems
    CheckMore -- No --> CommitTx[(Commit PostgreSQL Transaction)]
    CommitTx --> SocketBroadcast[Asynchronous Socket Broadcast:<br>inventory:update to Admin & Vendor]
```

---

# PART 5 — User Roles and Permissions

Permissions are enforced strictly by backend middleware (`authMiddleware.js`, `roleMiddleware.js`, `demoGuardMiddleware.js`). The frontend hides navigation buttons for user convenience, but backend guards reject unauthorized API access with HTTP `401 Unauthorized` or `403 Forbidden`.

### Comprehensive Role-Permission Matrix

| Functional Module / API Capability | Public / Guest | CUSTOMER | VENDOR (Cashier) | KITCHEN | ADMIN | DEMO ADMIN |
|---|---|---|---|---|---|---|
| **View Menu Catalog** (`GET /api/menu`) | ✅ Yes (Cached) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Verify Table QR** (`POST /api/sessions`) | ✅ Yes | ✅ Yes | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Email OTP Issuance** (`POST /api/auth/send-otp`) | ✅ UIT Only | ✅ UIT Only | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Customer Cart Mutations** (`/api/cart/*`) | ⚠️ Session Auth | ⚠️ Session Auth | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked |
| **Place Order** (`POST /api/orders`) | ❌ (Must Verify) | ✅ Verified UIT | ✅ Walk-in POS | ❌ Blocked | ✅ Testing | 🔒 Read-Only Block |
| **Live Order Tracking** (`GET /api/orders/track/:token`)| ✅ Valid Token | ✅ Own Orders | ✅ Branch Queue | ✅ Branch Queue | ✅ All Branches | ✅ All Branches |
| **Counter Cash Billing** (`POST /api/orders`) | ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **Submit Online Tx ID** (`POST /api/payments/submit`) | ❌ Blocked | ✅ Own Orders | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **Approve / Reject Payment** (`POST /api/payments/verify/:id`)| ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **KDS Status Bumping** (`PUT /api/orders/:id/status`) | ❌ Blocked | ❌ Blocked | ✅ Permitted | ✅ Permitted | ✅ Permitted | 🔒 Read-Only Block |
| **Payment Settings Toggle** (`PUT /api/payments/settings`) | ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **Manual Stock Inwarding** (`POST /api/inventory/receiving-batch`)| ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **AI Vision OCR Scan** (`POST /api/inventory/receivings/ocr-preview`)| ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **Excel Inwarding Import** (`POST /api/inventory/receivings/import/preview`)| ❌ Blocked | ❌ Blocked | ✅ Permitted | ❌ Blocked | ✅ Permitted | 🔒 Read-Only Block |
| **Menu Item CRUD** (`POST/PUT/DELETE /api/menu`) | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | 🔒 Read-Only Block |
| **Recipe Cost Mappings** (`POST /api/inventory/recipes/:id`) | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | 🔒 Read-Only Block |
| **Staff Provisioning** (`POST /api/admin/staff`) | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | 🔒 Read-Only Block |
| **Customer Block/Unblock** (`POST /api/admin/customers/:id/block`)| ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | 🔒 Read-Only Block |
| **System Audit Logs** (`GET /api/admin/audit-logs`) | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | ✅ Read-Only View |
| **Financial CSV/PDF Exports** (`exportUtils.js`) | ❌ Blocked | ❌ Blocked | ❌ Blocked | ❌ Blocked | ✅ Full Access | 🔒 Blocked by Modal |

---

# PART 6 — Complete Module-by-Module Documentation

## A. Authentication and Customer Verification
- **Code Locations:** [`authController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/authController.js), [`authMiddleware.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/middleware/authMiddleware.js), [`authRoutes.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/routes/authRoutes.js).
- **Staff Authentication Flow:**
  - Login via `POST /api/auth/login` requires `{ email, password }`.
  - Password comparison via `bcrypt.compare(password, user.password)`.
  - Rejects inactive users (`user.isActive === false`) with HTTP 403.
  - Rejects legacy customer backdoor passwords (`guest_customer_password_2026`).
  - Issues signed JWT Access Token (expires in 7 days) and Refresh Token (expires in 30 days) signed with `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- **Customer OTP Verification Flow:**
  - Customers cannot log in with arbitrary passwords. They must invoke `POST /api/auth/send-otp`.
  - Strict UIT Domain Validation: Checked via regex `/^[0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5}@students\.uitu\.edu\.pk$/i`.
  - Account Active Verification: Checks if student is blocked (`user.isActive === false`); if blocked, aborts with HTTP 403.
  - Rate Limiting & Cooldown: Enforces 30-second resend cooldown. Older active OTPs for the email are deleted.
  - OTP Generation: Cryptographic 6-digit random number (`crypto.randomInt(100000, 1000000)`). Stored as an HMAC-SHA256 digest in `EmailOTP.codeHash`.
  - Verification (`POST /api/auth/verify-otp`):
    - Validates 6-digit structure.
    - Limits attempts to 5 per record before burning the OTP.
    - Uses `crypto.timingSafeEqual` to prevent timing attacks.
    - Atomically marks `verifiedAt = new Date()` using `updateMany` to prevent concurrent reuse.
    - Creates `User` with role `CUSTOMER` if first visit, or returns existing user record.

## B. Customer Portal & QR Dining Flow
- **Code Locations:** [`CustomerPortalPage.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/pages/customer/CustomerPortalPage.jsx), [`CustomerCartPage.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/pages/customer/CustomerCartPage.jsx), [`OrderTrackingPage.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/pages/customer/OrderTrackingPage.jsx), [`CustomerDashboard.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/CustomerDashboard.jsx).
- **Session Claiming Flow:**
  - Route: `/customer/table/:tableId` where `:tableId` represents the signed HMAC token.
  - If a user navigates to `/customer` without a table token, `CustomerDashboard` displays an in-app QR scanner or instructions to scan their physical table QR code.
  - Once validated by `POST /api/sessions`, a session UUID and hashed session secret are created and stored in browser `localStorage`.
- **Cart Management:**
  - Persisted in `localStorage` under `customer_cart` and synchronized to the server database `Cart` and `CartItem` models.
  - Items can be added, decremented, incremented, or cleared.
  - Real-time stock validation ensures customers cannot add out-of-stock items.

## C. QR Codes, Tables, and Dining Sessions
- **Code Locations:** [`qrSecurityService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/qrSecurityService.js), [`sessionController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/sessionController.js), [`tableController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/tableController.js), [`sweepJob.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/sweepJob.js).
- **HMAC QR Token Specification:**
  - Format: `tbl:<tableNumber>:<branchId>:<nonce>:<HMAC_signature>`
  - Generated using HMAC-SHA256 with key `QR_SECRET`.
  - Signature verification uses `crypto.timingSafeEqual` to prevent forgery.
- **Session Lifecycle & Idle Inactivity:**
  - Created with `status = 'ACTIVE'`, `startedAt = now`, `expiresAt = now + 10 mins`.
  - Every customer user interaction (`scroll`, `pointerdown`, `keydown`) triggers a debounced ping via `sessionActivityMiddleware.js`, updating `lastActivityAt` and extending `expiresAt` by 10 minutes.
  - Background Sweep Job (`sweepJob.js`): Runs every 60 seconds. Finds sessions where `status = 'ACTIVE'` and `expiresAt < now`, transitioning them to `EXPIRED` and auto-canceling unpaid pending orders.

## D. Menu Management Engine
- **Code Locations:** [`menuController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/menuController.js), [`AdminMenuView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminMenuView.jsx).
- **Features:**
  - Full CRUD operations on `MenuItem` and `Category`.
  - Variant Grouping: Items sharing a `groupName` (e.g. "Chicken Biryani") are rendered as grouped variant options in the customer interface.
  - Supabase Image Ingestion (`/api/menu/upload-image`): Uploads base64/binary image payloads directly to the Supabase Storage bucket `Menu Images`.
  - In-Memory Cache: `getAllItems` caches catalog payloads for 10 seconds, immediately invalidated upon any create/update/delete operation.

## E. Orders and Order Lifecycle
- **Code Locations:** [`orderController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/orderController.js), [`statusValues.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/utils/statusValues.js).
- **Order Number Generation:** Format `ORD-YYYY-XXXXXX` (e.g. `ORD-2026-489211`) generated via cryptographically secure random integers.
- **Order Status Transitions:**
  ```
  [Customer Places Order]
             │
             ▼
        ┌─────────┐
        │ PENDING │
        └────┬────┘
             │
             ├──────────────────────────────────────────────┐
             │ (Online Payment Submitted)                   │ (Counter Cash Payment)
             ▼                                              ▼
  ┌───────────────────┐                         ┌───────────────────┐
  │  PAYMENT_PENDING  │                         │       PAID        │
  └─────────┬─────────┘                         └─────────┬─────────┘
            │ (Cashier / Webhook Approves)                │
            └──────────────────────┬──────────────────────┘
                                   ▼
                         ┌───────────────────┐
                         │     PREPARING     │  (Kitchen Bumps to Cooking)
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │       READY       │  (Kitchen Bumps to Ready)
                         └─────────┬─────────┘
                                   ▼
                         ┌───────────────────┐
                         │     COMPLETED     │  (Meal Collected / Served)
                         └───────────────────┘
  ```
- **Terminal & Cancellation States:**
  - `CANCELLED`: Order cancelled by cashier/admin or sweep job. Triggers inventory restoration.
  - `PAYMENT_FAILED`: Verification rejected. Triggers inventory restoration.
  - `REFUNDED`: Payment reversed. Triggers inventory restoration.
- **Audit Logging:** Every transition inserts a record into `OrderStatusHistory` storing `orderId`, `previousStatus`, `newStatus`, `changedByUserId`, and a descriptive `note`.

## F. Payment Systems & Integrations
- **Code Locations:** [`paymentController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/paymentController.js), [`payfastService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/payfastService.js).
- **Payment Methods Supported:**
  1. **COD (Cash on Delivery / Pay at Counter):** Order placed with `paymentStatus = 'UNPAID'`. Cashier collects cash at the counter and verifies the order.
  2. **Easypaisa / JazzCash (Manual Wallet Verification):** Customer transfers funds to university merchant accounts via USSD/App and submits their Transaction ID (`paymentTxId`). State becomes `PAYMENT_PENDING` / `PENDING_VERIFICATION`. Staff verifies against incoming SMS and clicks Approve.
  3. **PayFast Hosted Gateway Sandbox:**
     - Initiation endpoint: `POST /api/payments/payfast/initiate`.
     - Generates MD5 signature for form fields.
     - Webhook handler: `POST /api/payments/payfast/notify` processes Instant Transaction Notifications (ITN), validates signature, sets `paymentStatus = 'VERIFIED'`, `status = 'PAID'`, and executes FIFO inventory deduction.

## G. Cashier / Vendor Counter POS Terminal
- **Code Locations:** [`CashierPOSPage.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/pages/cashier/CashierPOSPage.jsx), [`VendorDashboard.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/VendorDashboard.jsx).
- **Capabilities:**
  - High-speed visual catalog grid with category filters and instant item search.
  - Walk-in order builder: Creates counter orders without requiring customer table QR scanning (assigned to snapshot table label `Counter`).
  - Active Order Queue: Live updates via Socket.IO for incoming QR orders.
  - One-click payment verification: Approves cash payments or manual wallet transaction IDs, emitting events that bump orders to kitchen boards.
  - Receipt Generation: Prints formatted 80mm thermal receipts or full-page invoices.

## H. Kitchen Display System (KDS)
- **Code Locations:** [`KitchenBoardPage.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/pages/kitchen/KitchenBoardPage.jsx), [`KitchenDashboard.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/KitchenDashboard.jsx).
- **Capabilities:**
  - Multi-order card grid showing table numbers, elapsed timer countdowns, item lists, and special cooking instructions.
  - Color-coded urgency alerts based on estimated preparation time.
  - Bump bar action buttons:
    - `Start Cooking`: Transitions order to `PREPARING`.
    - `Mark Ready`: Transitions order to `READY` (triggers customer pickup email and tracking screen update).
    - `Mark Served`: Transitions order to `COMPLETED`.
  - Audio Chime: Automatically plays audio notifications whenever a new paid order arrives over WebSockets (`order:new`).

## I. Inventory Management & Recipe Mapping
- **Code Locations:** [`inventoryDeductionService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/inventoryDeductionService.js), [`unitConverter.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/utils/unitConverter.js), [`AdminRecipeBuilderView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminRecipeBuilderView.jsx).
- **Recipe Definition:** `RecipeItem` links `MenuItem` to raw `InventoryItem`. E.g., 1 "Zinger Burger" links to:
  - 150 grams of "Chicken Breast Boneless"
  - 1 unit of "Burger Bun"
  - 20 grams of "Mayonnaise Sauce"
- **Unit Conversion Engine:** Seamlessly converts between incompatible metric and custom units:
  - Mass: `KG` ↔ `G` ↔ `MG`
  - Volume: `L` ↔ `ML`
  - Discrete counts: `PCS`, `DOZEN`, `PACK` (with custom `packageConversions` JSON support).
- **Atomic Stock Deduction:** Runs inside database transactions using `SELECT ... FOR UPDATE` ordered by `id ASC` to prevent concurrent deadlocks. Deducts from the oldest available receiving lot first (FIFO).
- **Stock Restoration:** Cancelling or refunding an order finds original `USAGE` logs and reverses the deductions atomically, logging `RESTORATION` records.

## J. Automated Inventory Receiving (OCR, AI Vision & Excel)
- **Code Locations:** [`inventoryReceivingBatchController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/inventoryReceivingBatchController.js), [`aiOcrService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/aiOcrService.js), [`groqService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/groqService.js).
- **Receiving Methods:**
  1. **Manual Entry:** Staff fills structured line items in `AdminInventoryReceivingView`.
  2. **Excel / CSV Import:** Uploads vendor spreadsheets. SheetJS extracts headers, matches columns (`Item`, `Qty`, `Rate`, `Batch`, `Expiry`), and runs fuzzy matching against catalog items.
  3. **Multimodal AI Vision OCR:**
     - User uploads paper bill photo or PDF.
     - Sent to Groq Multimodal Vision API (`qwen/qwen3.8-27b`).
     - Extracts structured JSON: supplier name, invoice number, items, quantities, rates, batch numbers, and expiry dates.
     - If image is unreadable, falls back to Tesseract.js client OCR text extraction and secondary LLM parsing.
- **Smart Catalog Matching Engine:**
  - Prevents matching incompatible variants (e.g. `Chicken Breast` will never auto-match with `Chicken Mince`).
  - Supports English, Roman Urdu (`aloo`, `pyaz`, `tamatar`), and Urdu script (`آلو`, `پیاز`).
- **Confirm & Receive:** Commits batch to `InventoryReceiving` with status `RECEIVED`, creates `InventoryReceivingItem` rows with `remainingQuantity = quantity`, updates `InventoryItem.stockLevel`, and writes `STOCK_IN` logs.

## K. Admin Dashboard, Analytics & Financial Intelligence
- **Code Locations:** [`adminController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/adminController.js), [`AdminHomeView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminHomeView.jsx), [`AdminCostsMarginsView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminCostsMarginsView.jsx).
- **Analytical Metrics Calculated:**
  - **Gross Revenue:** Sum of `total` for orders where `status = 'COMPLETED'` or `status = 'PAID'` within date filters.
  - **Average Order Value (AOV):** `Total Revenue / Total Paid Orders`.
  - **Recipe Food Cost Ratio:** Computed per dish as `(Total Ingredient Cost / Menu Selling Price) * 100`. Highlights high-margin items vs unprofitable dishes.
  - **In-Memory Analytical Caching:** `getDashboardStats` caches aggregated payloads for 15 seconds, delivering sub-millisecond response times for frequent navigation.

## L. Customer Management, Blocking & Disputes
- **Code Locations:** [`adminController.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/adminController.js), [`disputeService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/disputeService.js), [`AdminCustomersView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminCustomersView.jsx).
- **Student Roster & Search:** Lists all registered students, their roll numbers extracted from emails, total orders placed, and active status.
- **Customer Account Blocking:**
  - Admin can block misbehaving students (`isActive = false`) selecting from validated reasons: `DISCIPLINARY_ACTION`, `REPEATED_UNPAID_ORDERS`, `FRAUDULENT_ACTIVITY`, `ABUSIVE_BEHAVIOR`, `PAYMENT_DISPUTE`, `OTHER`.
  - Emits real-time socket event `customer:account-blocked` to terminate active customer sessions immediately.
  - Blocked students cannot request OTPs, claim sessions, or place orders.
- **Dispute Subsystem:**
  - Customers can file complaints against orders.
  - Admin reviews issues, categorizes findings, provides resolution notes, and marks disputes as `RESOLVED`.

## M. Transactional Email & Notification Subsystem
- **Code Locations:** [`emailService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/emailService.js), [`emailTemplateHelpers.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/emailTemplateHelpers.js).
- **Email Triggers & Conditions:**
  1. `sendOTPEmail`: Sent during customer login/verification. Contains 6-digit code, 5-minute validity warning, and auto-fill magic link.
  2. `sendOrderPlacementEmail`: Triggered on order creation. Includes itemized invoice, tax breakdown, live tracking link, and payment instructions (differentiating COD vs Online).
  3. `sendPaymentConfirmedEmail`: Triggered when cashier or PayFast approves payment. Functions as official digital receipt.
  4. `sendOrderReadyEmail`: Triggered when kitchen bumps order to `READY`. Alerts student to collect meal from counter.
  5. `sendOrderCompletionEmail`: Triggered when order is marked `COMPLETED` / served.
  6. `sendOrderCancellationEmail`: Triggered on rejection, cancellation, or refund with explanatory reason.

## N. Audit Logging & Order Status History
- **Code Locations:** [`auditMiddleware.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/middleware/auditMiddleware.js), [`AdminAuditLogsView.jsx`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/frontend/src/components/admin/views/AdminAuditLogsView.jsx).
- **Data Capture:**
  - Persisted in the `AuditLog` table.
  - Stores `userId`, `action` (e.g. `STAFF_LOGIN`, `MENU_ITEM_CREATE`, `STUDENT_BLOCKED`), `entity`, `entityId`, `oldValue`, `newValue`, `ip` address, and timestamp.
  - Completely immutable: No update or delete endpoints exist for audit logs.

## O. Machine Learning & Artificial Intelligence Subsystems
- **Code Locations:** [`ai-service/main.py`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/ai-service/main.py), [`ai-service/model.py`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/ai-service/model.py), [`groqService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/groqService.js).
- **1. ETA Prediction Engine:**
  - Microservice endpoint: `POST http://localhost:8000/predict-eta`.
  - Model: `RandomForestRegressor(n_estimators=50)` trained on synthetic samples at service boot.
  - Inputs: `base_eta`, `queue_length`, `hour`, `day_of_week`, `is_peak_hour`, `kitchen_load`, `historical_delay`.
  - Output: `estimated_time` in minutes.
  - Fallback: Mathematical regression formula in Python and Node.js if scikit-learn is unavailable.
- **2. Inventory Demand Forecasting Engine:**
  - Microservice endpoint: `POST http://localhost:8000/predict`.
  - Inputs: `item_name`, `weekday`, `month`, `season`, `promotions`, `exams_season`, `weather`.
  - Output: Forecasted quantity, confidence score, percentage change, and descriptive recommendation note.
- **3. Multimodal LLM Multi-Key Resilience Matrix:**
  - Rotates dynamically across all keys matching `GROQ_API_KEY*` in `.env`.
  - Implements 62-second cooldown tracking per key upon HTTP 429 rate limit errors.
  - Permanent session blacklisting on HTTP 401 invalid credentials.
  - Fallback model progression: `qwen/qwen3.8-27b` → `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `allam-2-7b`.

---

# PART 7 — Exact Business Logic and Rules

| Business Rule Area | Preconditions & Validation | Triggering Action | Backend Function / API | Database State Changes | Error / Failure Behavior |
|---|---|---|---|---|---|
| **Student Domain Enforcement** | Must match regex: `^[0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5}@students\.uitu\.edu\.pk$` | Customer requests OTP or places order | `validateStudentEmail` in `authController.js` & `orderController.js` | None | Rejects with HTTP 400: *"Only @students.uitu.edu.pk domain is permitted."* |
| **Account Restriction Enforcement** | `User.isActive === true` | OTP request, session start, or order placement | Pre-check in controllers | None | Rejects with HTTP 403: *"This student account has been restricted by administration."* |
| **Dining Session Claiming** | Valid HMAC-signed QR token for an active physical table | Scanned QR URL navigation | `startSession` in `sessionController.js` | Inserts `Session` (10-min expiry), generates hashed secret, creates `Cart` | Rejects with HTTP 400: *"Please scan your table QR code"* (`TABLE_QR_REQUIRED`) |
| **Order Item Size Caps** | Items count $\le 30$; Quantity per item $\in [1, 50]$ | Order checkout submission | `createOrder` in `orderController.js` | None | Rejects with HTTP 400: `ORDER_TOO_LARGE` or `INVALID_QUANTITY` |
| **Concurrent Open Order Cap** | Unfinished orders for session $< 5$ | Order checkout submission | `createOrder` in `orderController.js` | None | Rejects with HTTP 400: *"Too many open orders for this table session."* |
| **Server-Side Price Authority** | Client prices ignored; re-queried from `MenuItem.price` | Order checkout submission | `createOrder` in `orderController.js` | Subtotal, Tax (0%), Total calculated strictly on server | Returns server-computed totals |
| **Stock Deduction Idempotency** | Order must be in `PAID` state; checks for existing `USAGE` logs | Payment approval or PayFast ITN webhook | `deductInventoryForConfirmedOrder` in `inventoryDeductionService.js` | Decrements `InventoryItem.stockLevel`, decrements batch `remainingQuantity`, writes `USAGE` logs | Skips redundant deduction if logs exist |
| **Stock Restoration on Refund** | Order transitions to `CANCELLED`, `PAYMENT_FAILED`, or `REFUNDED` | Cashier cancellation or payment rejection | `restoreInventoryForOrder` in `inventoryDeductionService.js` | Increments `InventoryItem.stockLevel`, restores batch `remainingQuantity`, writes `RESTORATION` logs | Strict idempotency prevents duplicate restoration |
| **Deadlock Resilience** | Order status mutations wrapped in `withDeadlockRetry` | Payment verification and order bumping | `withDeadlockRetry` in `dbRetry.js` | Retries transaction up to 5 times on PostgreSQL error `40P01` or `40001` | Fails gracefully if retries exhausted |
| **Demo Mode Lockdown** | `User.isDemo === true` | Any mutating HTTP verb (`POST`, `PUT`, `PATCH`, `DELETE`) | `demoGuardMiddleware.js` | Mutation blocked; zero database writes | Rejects with HTTP 403: *"Demo Sandbox Mode is read-only."* |

---

# PART 8 — Database Schema and Relationships

```mermaid
erDiagram
    Branch ||--o{ Table : contains
    Branch ||--o{ User : employs
    Branch ||--o{ MenuItem : offers
    Branch ||--o{ InventoryItem : stocks
    Branch ||--o{ Order : processes
    Branch ||--o{ InventoryReceiving : receives

    Table ||--o{ Session : hosts
    Table ||--o{ Order : serves

    User ||--o{ Order : places
    User ||--o{ Session : claims
    User ||--o{ AuditLog : generates
    User ||--o{ OrderStatusHistory : logs
    User ||--o{ InventoryLog : authorizes
    User ||--o{ InventoryReceiving : receives
    User ||--o{ Dispute : files

    Session ||--o| Cart : owns
    Session ||--o{ Order : contains
    Session ||--o{ EmailOTP : tracks

    Cart ||--o{ CartItem : holds
    MenuItem ||--o{ CartItem : referenced_in
    MenuItem ||--o{ OrderItem : snapshot_in
    MenuItem ||--o{ RecipeItem : composed_of

    Order ||--o{ OrderItem : includes
    Order ||--o| Payment : settled_by
    Order ||--o| ETAPrediction : evaluated_by
    Order ||--o{ OrderStatusHistory : tracks
    Order ||--o{ Dispute : disputed_in

    Supplier ||--o{ InventoryItem : supplies
    Supplier ||--o{ InventoryLog : referenced_in
    Supplier ||--o{ InventoryReceiving : bills

    InventoryItem ||--o{ RecipeItem : ingredient_of
    InventoryItem ||--o{ InventoryLog : tracked_in
    InventoryItem ||--o{ InventoryReceivingItem : delivered_in

    InventoryReceiving ||--o{ InventoryReceivingItem : contains
    InventoryReceiving ||--o{ InventoryLog : generates
```

### Database Model Field Specifications

- **`Branch`**: Multi-location support (`id`, `name`, `address`, `phone`, `isActive`).
- **`Table`**: Physical dining stations (`id`, `branchId`, `tableNumber`, `qrToken`, `isActive`).
- **`User`**: Account entities (`id`, `email`, `password`, `name`, `role`, `isDemo`, `isActive`, `branchId`).
- **`Session`**: Customer visits (`id`, `tableId`, `tableLabel`, `customerId`, `status`, `startedAt`, `expiresAt`, `secretHash`).
- **`Cart` & `CartItem`**: Transient basket storage (`sessionId`, `menuItemId`, `quantity`, `price`).
- **`Category`**: Menu taxonomy (`id`, `name`, `slug`, `isActive`).
- **`MenuItem`**: Dish catalog (`id`, `name`, `price`, `category`, `stock`, `prepTime`, `imageUrl`, `groupName`).
- **`Order`**: Order header (`id`, `orderNumber`, `sessionId`, `customerId`, `tableNumber`, `customerEmail`, `status`, `subtotal`, `tax`, `discount`, `total`, `paymentStatus`, `paymentMethod`, `paymentTxId`, `trackingToken`).
- **`OrderItem`**: Historical snapshot lines (`id`, `orderId`, `menuItemId`, `nameSnapshot`, `priceSnapshot`, `quantity`, `subtotal`).
- **`Payment`**: Financial records (`id`, `orderId`, `amount`, `method`, `txId`, `status`).
- **`ETAPrediction`**: Machine learning prediction history (`id`, `orderId`, `baseEta`, `adjustedEta`, `actualTime`, `queueLength`, `kitchenLoad`).
- **`DemandForecast`**: ML sales forecast (`id`, `menuItemName`, `forecastDate`, `predictedQty`, `confidence`).
- **`Supplier`**: Raw ingredient vendors (`id`, `name`, `contactPerson`, `email`, `phone`, `address`).
- **`RecipeItem`**: Recipe composition (`id`, `menuItemId`, `inventoryItemId`, `quantity`, `unit`).
- **`InventoryItem`**: Raw stock ledger (`id`, `name`, `category`, `stockLevel`, `unit`, `minThreshold`, `costPrice`, `expiryDate`).
- **`InventoryReceiving` & `InventoryReceivingItem`**: Inwarding lots (`receivingNumber`, `supplierId`, `status`, `quantity`, `remainingQuantity`, `batchNumber`, `expiryDate`).
- **`InventoryLog`**: Immutable stock journal (`id`, `inventoryItemId`, `type`, `quantityBefore`, `quantityAfter`, `changeQty`, `cost`, `batchNumber`).
- **`EmailOTP`**: One-time passwords (`email`, `sessionId`, `codeHash`, `expiresAt`, `attempts`, `verifiedAt`).
- **`AuditLog`**: Security trails (`userId`, `action`, `entity`, `entityId`, `oldValue`, `newValue`, `ip`).
- **`OrderStatusHistory`**: Order state transitions (`orderId`, `previousStatus`, `newStatus`, `changedByUserId`, `note`).
- **`PaymentSetting`**: Global payment gateway toggles (`codEnabled`, `onlineEnabled`).
- **`Dispute`**: Customer grievance records (`customerId`, `customerEmail`, `orderId`, `category`, `status`, `resolution`).

---

# PART 9 — API Route & Controller Reference

| HTTP Method | Route Endpoint | Middleware / Role | Controller Function | Description & Key Responsibilities |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public, Rate-Limited | `authController.login` | Authenticates staff and customers; returns JWT and refresh token. |
| `POST` | `/api/auth/register` | Public, Rate-Limited | `authController.register` | Registers customer accounts (staff registration blocked). |
| `POST` | `/api/auth/refresh` | Public | `authController.refreshToken` | Rotates expired access token using valid refresh token. |
| `POST` | `/api/auth/send-otp` | Public, Rate-Limited | `authController.sendOTP` | Sends 6-digit verification code to student UIT email address. |
| `POST` | `/api/auth/verify-otp` | Public, Rate-Limited | `authController.verifyOTP` | Verifies OTP code using timing-safe comparisons; provisions student. |
| `GET` | `/api/auth/profile` | Authenticated | `authController.getProfile` | Retrieves authenticated user profile and branch scope. |
| `POST` | `/api/sessions` | Public, Rate-Limited | `sessionController.startSession` | Validates HMAC table token; initializes dining session and cart. |
| `GET` | `/api/sessions/:id` | Public | `sessionController.getSession` | Retrieves dining session status and extends idle inactivity. |
| `GET` | `/api/cart/:sessionId` | Public | `cartController.getCart` | Fetches active cart items and server-calculated totals. |
| `POST` | `/api/cart/:sessionId/items` | Public | `cartController.addItemToCart` | Adds a menu item to the cart with server price validation. |
| `DELETE`| `/api/cart/:sessionId/items/:id`| Public | `cartController.removeItemFromCart`| Removes line item from active cart. |
| `GET` | `/api/menu` | Public (10s Cache) | `menuController.getAllItems` | Retrieves active menu items catalog with variant groups. |
| `POST` | `/api/menu` | ADMIN | `menuController.createItem` | Creates a new menu item; invalidates catalog cache. |
| `POST` | `/api/menu/upload-image` | ADMIN, 10MB Limit | `menuController.uploadImage` | Uploads dish photograph directly to Supabase Storage bucket. |
| `GET` | `/api/orders` | Authenticated Staff | `orderController.getAllOrders` | Retrieves paginated and filtered order queues for POS / KDS. |
| `POST` | `/api/orders` | Customer / Cashier | `orderController.createOrder` | Creates order with server price recalculation and tracking token. |
| `GET` | `/api/orders/track/:token` | Public | `orderController.trackOrderByToken` | Retrieves live order status, table snapshot, and prep updates. |
| `PUT` | `/api/orders/:id/status`| VENDOR, KITCHEN, ADMIN| `orderController.updateOrderStatus`| Advances order state (`PAID` → `PREPARING` → `READY` → `COMPLETED`). |
| `POST` | `/api/payments/submit` | Authenticated | `paymentController.submitTransactionId` | Submits Easypaisa / JazzCash transaction ID for verification. |
| `POST` | `/api/payments/verify/:id`| VENDOR, ADMIN | `paymentController.verifyTransaction` | Approves/rejects transaction; triggers atomic FIFO stock deduction. |
| `POST` | `/api/payments/payfast/initiate`| Public | `paymentController.initiatePayfastPayment`| Computes MD5 signature and parameters for PayFast checkout. |
| `POST` | `/api/payments/payfast/notify`| Public Webhook | `paymentController.handlePayfastITN`| Validates PayFast ITN signature, marks order PAID, deducts stock. |
| `GET` | `/api/payments/settings` | Public | `paymentController.getPaymentSettings`| Returns global payment toggles (`codEnabled`, `onlineEnabled`). |
| `PUT` | `/api/payments/settings` | VENDOR, ADMIN | `paymentController.updatePaymentSettings`| Toggles payment availability; broadcasts socket update to all. |
| `GET` | `/api/inventory` | Authenticated Staff | `inventoryController.getAllInventory`| Returns raw inventory stock items and low-stock alerts. |
| `POST` | `/api/inventory/recipes/:id`| ADMIN | `inventoryController.saveRecipe` | Maps raw stock ingredients to menu items. |
| `POST` | `/api/inventory/recipes/ai-suggest`| ADMIN | `inventoryController.aiSuggestRecipe`| LLM-suggests ingredient mappings from item titles. |
| `POST` | `/api/inventory/receiving-batch`| VENDOR, ADMIN | `inventoryReceivingBatchController.createReceivingBatch`| Creates draft or confirms stock receiving batch. |
| `POST` | `/api/inventory/receivings/ocr-preview`| VENDOR, ADMIN | `inventoryController.ocrInvoicePreview`| Extracts structured stock items from invoice image via Groq AI. |
| `POST` | `/api/inventory/receivings/import/preview`| VENDOR, ADMIN| `inventoryController.previewExcelImport`| Parses uploaded vendor spreadsheet and fuzzy-matches items. |
| `GET` | `/api/admin/dashboard-stats`| ADMIN (15s Cache) | `adminController.getDashboardStats` | Returns gross revenue, orders, stock alerts, and payment splits. |
| `POST` | `/api/admin/customers/:id/block`| ADMIN | `adminController.blockCustomerAccount`| Blocks student account with validated reason; emits socket alert. |
| `POST` | `/api/admin/customers/:id/unblock`| ADMIN | `adminController.unblockCustomerAccount`| Restores student ordering permissions; emits socket alert. |
| `GET` | `/api/admin/audit-logs` | ADMIN | `adminController.getAuditLogs` | Returns paginated immutable security audit trails. |
| `GET` | `/health` | Public | Healthcheck probe | Returns `{ status: 'healthy', timestamp: '...' }`. |
| `GET` | `/ready` | Public | Readiness probe | Evaluates PostgreSQL connection and Redis latency. |

---

# PART 10 — Frontend Pages, Views, and UI Components

### Route and Page Inventory

| Route Path | View / Component File | Access Scope | Description & UI Capabilities |
|---|---|---|---|
| `/` | `RoleLogin.jsx` | Public | Landing portal selector; redirects to `/customer` by default. |
| `/customer` | `CustomerPortalPage.jsx` | Public / Customer | Scanned table menu browsing landing; prompts for camera scan if no table token is present. |
| `/customer/table/:tableId` | `CustomerPortalPage.jsx` | Public / Customer | Direct QR scan landing; validates table token and initializes dining session. |
| `/customer/cart` | `CustomerCartPage.jsx` | Public / Customer | Basket review, OTP verification modal, wallet payment modal, and checkout submission. |
| `/customer/track/:token`| `OrderTrackingPage.jsx` | Public / Customer | Real-time WebSocket order status tracker, prep progress bar, and counter pickup banner. |
| `/cashier/login` | `RoleLogin.jsx` (`roleType="CASHIER"`) | Staff Login | Cashier terminal credential authentication form. |
| `/cashier/*` | `CashierPOSPage.jsx` (`VendorDashboard.jsx`) | VENDOR | Walk-in counter POS terminal, incoming table orders queue, and cash/wallet payment approval. |
| `/kitchen/login` | `RoleLogin.jsx` (`roleType="KITCHEN"`) | Staff Login | Kitchen staff credential authentication form. |
| `/kitchen/*` | `KitchenBoardPage.jsx` (`KitchenDashboard.jsx`)| KITCHEN | Live Kitchen Display System (KDS) order bump bar with audio alerts. |
| `/admin/login` | `RoleLogin.jsx` (`roleType="ADMIN"`) | Staff Login | Administrator command center authentication form. |
| `/admin/*` | `AdminDashboardPage.jsx` (`AdminLayout.jsx`) | ADMIN | Main executive workspace housing the 22 administrative modular views. |

### Admin Modular View Directory (`components/admin/views/`)

1. `AdminHomeView.jsx`: Executive overview, gross revenue, active orders, and payment split charts.
2. `AdminMenuView.jsx`: Dish catalog, pricing, category filters, and Supabase image uploads.
3. `AdminRecipeBuilderView.jsx`: Maps raw stock ingredients to dishes; calculates gross profit margins.
4. `AdminInventoryView.jsx`: Raw stock catalog, minimum safety thresholds, and branch filtering.
5. `AdminInventoryReceivingView.jsx`: Stock receiving hub (Manual, Excel XLSX upload, Groq AI Vision invoice scanning).
6. `AdminExpiryTrackingView.jsx`: Batch expiration countdowns and perishable item status tracking.
7. `AdminCostsMarginsView.jsx`: Live food cost percentage calculations and profitability matrices.
8. `AdminAIInsightsView.jsx`: Machine learning demand forecasts and executive purchasing advice.
9. `AdminReportsView.jsx`: Audit financial reporting with CSV export and print-ready PDF styling.
10. `AdminOrdersView.jsx`: Comprehensive order management and historical status inspection.
11. `AdminKitchenMonitorView.jsx`: Admin-level live inspection of back-of-house kitchen queues.
12. `AdminPaymentsView.jsx`: Payment audit log showing transaction references and verification states.
13. `AdminPaymentAvailabilityView.jsx`: Global toggles for Cash on Delivery and Online Payments.
14. `AdminTablesQRView.jsx`: Table layout manager with instant HMAC QR code generator and PDF export.
15. `AdminBranchesView.jsx`: Multi-branch outlet management console.
16. `AdminStaffView.jsx`: Staff account administration and role provisioning (`ADMIN`, `VENDOR`, `KITCHEN`).
17. `AdminCustomersView.jsx`: Student customer directory, verification audit, and account blocking tools.
18. `AdminSuppliersView.jsx`: Vendor registry managing contact information and delivered ingredient catalogs.
19. `AdminAuditLogsView.jsx`: Security audit log viewer with user, action, and IP filtering.
20. `AdminActivityLogsView.jsx`: Detailed operational activity timeline.
21. `AdminNotificationsView.jsx`: System alerts and low-stock threshold notifications.
22. `AdminOrderStatusHistoryView.jsx`: Complete chronological ledger of all order state transitions.

---

# PART 11 — Real-Time WebSocket Event & Notification Map

The real-time subsystem is implemented using Socket.IO (`backend/src/sockets/socket.js` and `frontend/src/services/socket.js`). Connected sockets authenticate via handshake tokens and join multiplexed rooms:
- **`branch:${branchId}`**: Room for all staff operating in a specific branch.
- **`table:${tableId}`**: Room for customer devices seated at a specific table.
- **`user:${userId}`**: Dedicated channel for direct customer notifications.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Client
    actor Cashier as Cashier / POS
    actor Kitchen as Kitchen Bump Bar
    participant Server as Socket.IO Server
    participant DB as PostgreSQL

    Note over Customer, Server: Customer scans QR and starts dining session
    Server->>Cashier: table:sessionCreated (Table details)
    
    Note over Customer, Server: Customer places order (COD)
    Customer->>Server: HTTP POST /api/orders
    Server->>Cashier: order:new (Order payload)
    Server->>Customer: order:created (Tracking token)

    Note over Cashier, Server: Cashier collects cash & approves payment
    Cashier->>Server: HTTP POST /api/payments/verify/:id (Approve)
    Server->>DB: Atomic Update Order = PAID & Deduct FIFO Stock
    Server->>Kitchen: order:new (Trigger Audio Chime & Show Card)
    Server->>Customer: order:update (Status: PAID)
    Server->>Cashier: order:update (Status: PAID)

    Note over Kitchen, Server: Kitchen clicks 'Start Cooking'
    Kitchen->>Server: HTTP PUT /api/orders/:id/status (PREPARING)
    Server->>Customer: order:statusUpdate (Status: PREPARING)
    Server->>Cashier: order:update (Status: PREPARING)

    Note over Kitchen, Server: Kitchen clicks 'Mark Ready'
    Kitchen->>Server: HTTP PUT /api/orders/:id/status (READY)
    Server->>Customer: order:statusUpdate (Status: READY - Pickup Alert)
    Server->>Cashier: kitchen:orderReady (Order Number)

    Note over Kitchen, Server: Order served to diner
    Kitchen->>Server: HTTP PUT /api/orders/:id/status (COMPLETED)
    Server->>Customer: order:statusUpdate (Status: COMPLETED)
    Server->>Cashier: order:update (Status: COMPLETED)
```

### WebSocket Event Dictionary

| Event Name | Direction | Payload Structure | Triggering Action / Scope |
|---|---|---|---|
| `order:new` | Server → Kitchen / Cashier | Complete itemized `Order` object with `tableLabel` | Emitted when an order transitions to `PAID` (or COD creation for cashier). |
| `order:update` | Server → Cashier / Customer | Updated `Order` object | Emitted on payment approval, cancellation, or customer info changes. |
| `order:statusUpdate` | Server → Customer / Staff | `{ orderId, status, paymentStatus, order }` | Emitted when kitchen bumps order state (`PREPARING`, `READY`, `COMPLETED`). |
| `kitchen:orderReady` | Server → Cashier / Customer | `{ orderId, orderNumber, tableNumber }` | Emitted when kitchen bumps an order to `READY`. |
| `payment:verify` | Server → Cashier / Admin | `Order` object awaiting staff verification | Emitted when customer submits an Easypaisa / JazzCash transaction ID. |
| `paymentSettings:update`| Server → All Clients | `{ codEnabled, onlineEnabled, updatedAt }` | Emitted when cashier or admin toggles payment availability in settings. |
| `inventory:update` | Server → Admin / Vendor | Updated `InventoryItem` record | Emitted after atomic FIFO inventory deductions or manual stock adjustments. |
| `table:sessionCreated` | Server → Cashier | `{ sessionId, tableId, tableLabel, startedAt }`| Emitted when a customer scans a table QR code and claims a session. |
| `table:sessionEnded` | Server → All Clients | `{ sessionId, tableId, reason }` | Emitted when a session expires or is closed. |
| `customer:account-blocked`| Server → User Room | `{ userId, email, reason, action: 'ACCOUNT_BLOCKED' }` | Emitted when admin blocks a student account; terminates customer session. |
| `customer:account-unblocked`| Server → User Room | `{ userId, email, action: 'ACCOUNT_UNBLOCKED' }` | Emitted when admin lifts a student account restriction. |

---

# PART 12 — Environment Configuration and Deployment

### Configuration Parameters Roster

| Environment Variable | Service | Required? | Safe Example / Description |
|---|---|---|---|
| `PORT` | Backend / AI | Required | `5001` (Backend default), `8000` (AI Service default). |
| `NODE_ENV` | Backend | Required | `development` locally; `production` on Heroku. |
| `DATABASE_URL` | Backend | Required | `postgresql://user:pass@localhost:5432/zovikpos_dev`. In production: append `?connection_limit=5&pool_timeout=15&sslmode=no-verify`. |
| `JWT_SECRET` | Backend | Required | Cryptographically random string (32+ chars) for access tokens. |
| `JWT_REFRESH_SECRET` | Backend | Required | Cryptographically random string (32+ chars) for refresh tokens. |
| `QR_SECRET` | Backend | Required | Cryptographic secret for signing HMAC-SHA256 table QR tokens. |
| `FRONTEND_URL` | Backend | Required | `http://localhost:5173` locally; `https://zovik-pos.vercel.app` in production. |
| `CORS_ORIGINS` | Backend | Required | Comma-separated list of permitted origins for browser CORS policies. |
| `AI_SERVICE_URL` | Backend | Required | `http://localhost:8000` locally; `https://zovik-pos-ai.herokuapp.com` in production. |
| `SUPABASE_URL` | Backend | Required | Supabase project URL for menu image storage. |
| `SUPABASE_ANON_KEY` | Backend | Required | Supabase public anonymous API key for Storage bucket access. |
| `SMTP_HOST` | Backend | Required | `smtp.hostinger.com` (Production) or `smtp.gmail.com` (Local dev). |
| `SMTP_PORT` | Backend | Required | `465` (SSL) or `587` (TLS). |
| `SMTP_SECURE` | Backend | Required | `true` for port 465; `false` for port 587. |
| `SMTP_USER` | Backend | Required | Mailbox username (e.g. `support@zovikpos.store`). |
| `SMTP_PASS` | Backend | Required | Mailbox account or app password. |
| `EMAIL_FROM` | Backend | Required | Sender display string (e.g. `Zovik POS <support@zovikpos.store>`). |
| `GROQ_API_KEY` | Backend / AI | Required | Groq Cloud API key (`gsk_...`). Can add `GROQ_API_KEY_2`, etc., for failover. |
| `GROQ_MODEL` | Backend / AI | Optional | Default model (`qwen/qwen3.8-27b`). |
| `REDIS_URL` | Backend | Optional | Redis connection URI for shared rate limiting. Falls back to in-memory if omitted. |
| `PAYFAST_MERCHANT_ID` | Backend | Optional | PayFast Merchant ID (Sandbox: `10000100`). |
| `PAYFAST_MERCHANT_KEY` | Backend | Optional | PayFast Merchant Key (Sandbox: `46f0cd694581a`). |
| `PAYFAST_SANDBOX_URL` | Backend | Optional | `https://sandbox.payfast.co.za/eng/process`. |
| `VITE_API_URL` | Frontend | Required | Backend API origin (`http://localhost:5001` or Heroku URL). |
| `VITE_SOCKET_URL` | Frontend | Required | Backend WebSocket origin (same as API URL). |

---

# PART 13 — Current Known Issues and Technical Risks

Based on static code analysis, the following discrepancies, vulnerabilities, and technical risks were identified:

### 1. PayFast Initiation Field Mismatch Bug (Medium Severity)
- **File:** [`backend/src/controllers/paymentController.js#L395`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/controllers/paymentController.js#L395)
- **Finding:** The function `initiatePayfastPayment` constructs payload data with:
  ```javascript
  amount: Number(order.totalAmount).toFixed(2)
  ```
  However, in `backend/prisma/schema.prisma`, the model `Order` defines this field as `total Float`, not `totalAmount`.
- **Impact:** Calling `POST /api/payments/payfast/initiate` passes `undefined` to `Number()`, resulting in `NaN` and failing PayFast validation.

### 2. Ephemeral Filesystem Data Loss Risk on Heroku (Medium Severity)
- **File:** [`backend/src/services/aliasService.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/services/aliasService.js)
- **Finding:** Learned OCR item aliases and local fallback images are saved directly to local disk paths.
- **Impact:** Heroku dynos restart every 24 hours (dyno cycling), discarding all local filesystem writes. Learned aliases must be migrated to PostgreSQL to survive dyno restarts.

### 3. Socket.IO Multi-Dyno Scaling Limitation (Low to Medium Severity)
- **File:** [`backend/src/server.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/server.js) & [`backend/src/sockets/socket.js`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/backend/src/sockets/socket.js)
- **Finding:** Socket.IO initializes using the default in-memory adapter without `@socket.io/redis-adapter`.
- **Impact:** If the backend is scaled beyond 1 Heroku web dyno, socket broadcasts emitted on Dyno A will not reach clients connected to Dyno B.

### 4. Synthetic Model Training at Startup (Low Severity)
- **File:** [`ai-service/main.py#L81-L121`](file:///c:/Users/wajiz.pk/Downloads/zovikposv1/ai-service/main.py#L81-L121)
- **Finding:** The ETA prediction model trains on 200 randomly generated synthetic samples at every service boot rather than loading a pre-trained serialized model from historical kitchen performance.
- **Impact:** Predicted preparation times are approximations based on heuristics rather than real kitchen historical performance.

---

# PART 14 — Tests and Verification Status

### Test Suite Inventory
The repository utilizes Node.js's native test runner (`node --test`) defined in `backend/package.json` (`"test": "node --test test/*.test.js"`).

1. `adminStaffNoSupabase.test.js`: Verifies staff management operates independently of Supabase.
2. `dbRetry.test.js`: Validates PostgreSQL deadlock retry wrappers and exponential backoff.
3. `idempotency.test.js`: Verifies duplicate request prevention and API idempotency locks.
4. `money.test.js`: Verifies floating-point financial rounding to 2 decimal places (`roundMoney`).
5. `orderCartCaps.test.js`: Verifies order size and quantity limits (max 30 items, max 50 qty).
6. `rateLimitTiers.test.js`: Verifies sliding window rate limiters for auth and general endpoints.
7. `realPostgres.sessionHardening.test.js`: Integration test for session sweeps against a real database.
8. `requestTimeout.test.js`: Verifies the 25-second server request timeout guard.
9. `routeValidation.test.js`: Validates input parsing across API endpoints.
10. `sessionHardening.test.js`: Verifies dining session state transitions and activity refreshes.
11. `sessionSecurity.test.js`: Tests SHA-256 session secret hashing and validation.
12. `statusValues.test.js`: Tests allow-list validations for Order, Payment, and Session statuses.
13. `unitConverter.test.js`: Verifies mass, volume, and discrete unit conversion matrices.
14. `uploadImage.test.js`: Tests image payload limits and MIME-type restrictions.
15. `validation.test.js`: Verifies Zod schema validation rules.
16. `inventoryReceivingBatch.test.js`: Verifies bulk stock inwarding and GRN calculation math.

*Frontend Test Status:* `playwright` is listed in `frontend/package.json` devDependencies, but no test scripts or `.spec.js` test files are currently implemented in `frontend/`.

---

# PART 15 — Complete End-to-End User Flows

### Flow 1: Customer Dining via QR Code
1. Student sits at physical table and scans the table QR code using their smartphone camera.
2. The URL navigates to `/customer/table/:tableId` with the HMAC signed token.
3. `CustomerPortalPage` submits token to `POST /api/sessions`.
4. `sessionController` cryptographically verifies signature via `qrSecurityService.verifyTableToken`.
5. Server creates a `Session` (10-minute expiry window) and an associated `Cart`, returning a hashed session secret to the client.
6. Student enters their student email (`<roll_number>@students.uitu.edu.pk`) and receives a 6-digit email OTP.
7. Entering the code invokes `POST /api/auth/verify-otp`, which verifies the HMAC digest and claims the dining session.
8. Student browses dishes, adds items to cart, selects Cash on Delivery, and submits the order.
9. Server recalculates prices from database, creates the `Order` with `status = 'PENDING'`, generates a tracking token, and redirects to `/customer/track/:token`.
10. Cashier confirms cash receipt at the counter (`POST /api/payments/verify/:id`).
11. Order transitions to `PAID`, triggers atomic FIFO inventory deduction, and emits `order:new` via WebSockets to the kitchen.
12. Kitchen staff advances order to `PREPARING`, then `READY` (sending ready-for-pickup email).
13. Student collects food from the counter, and order is bumped to `COMPLETED`.

---

# PART 16 — Dependency and Change Impact Map

Before modifying any module in ZOVIK POS, inspect the following shared dependencies:

| If You Are Modifying... | You Must Also Inspect / Verify... | Why (Cross-Module Dependency) |
|---|---|---|
| **`backend/prisma/schema.prisma`** | `inventoryDeductionService.js`, `orderController.js`, `paymentController.js` | Database model changes require regenerating the Prisma client and updating transaction queries. |
| **`inventoryDeductionService.js`** | `paymentController.js`, `orderController.js`, `sweepJob.js` | Stock deduction is called during payment approval, and restoration is called on cancellations. |
| **`qrSecurityService.js`** | `sessionController.js`, `tableController.js`, `CustomerPortalPage.jsx` | Modifying QR token HMAC payload format breaks all existing printed table QR codes. |
| **`statusValues.js`** | `orderController.js`, `KitchenDashboard.jsx`, `OrderTrackingPage.jsx` | Adding or altering status strings affects state transition allow-lists and UI status pills. |
| **`authController.js`** | `authMiddleware.js`, `App.jsx`, `api.js` | Modifying JWT payload structure or token expiration affects automatic client refresh interceptors. |
| **`groqService.js`** | `aiOcrService.js`, `inventoryController.js` | Modifying Groq key rotation or vision schemas impacts invoice document parsing and Excel inwarding. |
| **`emailService.js`** | `emailTemplateHelpers.js`, `scripts/renderEmailPreviews.js` | Template changes must be validated across both plain-text and responsive HTML outputs. |

---

# PART 17 — Final Project Summary for Another AI Assistant

### 🤖 AI Project Context & Standing Development Rules

```
PROJECT IDENTITY:
  Name: ZOVIK POS (Smart Canteen & POS System)
  Environment: University Cafeteria (Usman Institute of Technology - UIT University)
  Stack: React 19 (Vite) + Node.js 20 (Express) + PostgreSQL (Prisma ORM) + Socket.IO + Python (FastAPI ML)

CORE ARCHITECTURAL RULES:
  1. Campus Verification: Customer accounts strictly enforce UIT student domains (<roll_number>@students.uitu.edu.pk).
  2. Table Access: Customer dining sessions REQUIRE an active physical table QR token signed with HMAC-SHA256.
  3. Price Authority: Client-submitted order prices are NEVER trusted; subtotal/total are recalculated on the server.
  4. FIFO Stock Deduction: Orders marked PAID trigger in-transaction raw stock deductions from the oldest receiving batches.
  5. Deadlock Handling: Order status changes and stock deductions use withDeadlockRetry on PostgreSQL 40P01 / 40001.
  6. Demo Lockdown: Accounts with isDemo: true are restricted by demoGuardMiddleware against all HTTP mutations.
  7. Ephemeral Storage: Menu images reside in Supabase Storage; local disk uploads do not persist across Heroku dyno cycles.

STANDING DEVELOPER CONSTRAINTS:
  - Always inspect existing code before proposing or implementing changes.
  - Never modify database schemas, migrations, or dependencies without explicit instructions.
  - Preserve documentation integrity and existing comments.
  - Make only the smallest requested change; never touch unrelated modules.
  - Never execute destructive database scripts (e.g. prisma db push --force-reset, db seed) against production.
```

---
*End of Complete Technical Reverse Engineering Documentation — ZOVIK POS FYP 2026*
