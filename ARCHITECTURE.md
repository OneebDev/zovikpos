# ZovikPOS — Complete System Architecture

> **AI-Powered Point-of-Sale System** · FYP 2026  
> Three-tier distributed architecture: React SPA → Node.js REST/Socket API → Python ML Service

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Technology Stack](#2-technology-stack)
3. [Frontend (React + Vite)](#3-frontend-react--vite)
4. [Backend (Node.js + Express)](#4-backend-nodejs--express)
5. [AI Service (Python + FastAPI)](#5-ai-service-python--fastapi)
6. [Database Layer](#6-database-layer)
7. [External Services](#7-external-services)
8. [Real-Time Communication](#8-real-time-communication)
9. [Security Architecture](#9-security-architecture)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
11. [API Reference Summary](#11-api-reference-summary)
12. [Environment Variables Reference](#12-environment-variables-reference)

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                   │
│                                                                         │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│   │   Customer   │  │   Cashier/   │  │   Kitchen    │  │   Admin   │  │
│   │   Portal     │  │   Vendor POS │  │   Board      │  │ Dashboard │  │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  │
│          │                 │                  │                │        │
│          └─────────────────┴──────────────────┴────────────────┘        │
│                              React 19 SPA                               │
│                         Vite + React Router v7                          │
│                    Deployed: Vercel (zovik-pos.vercel.app)              │
└────────────────────────────┬────────────────────────────────────────────┘
                             │  HTTPS + WebSocket (Socket.IO)
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                          API LAYER                                      │
│                                                                         │
│                    Node.js 20 + Express 4                               │
│                    ┌─────────────────────┐                              │
│                    │   REST API Endpoints │                              │
│                    │   Socket.IO Server   │                              │
│                    │   JWT Auth + RBAC    │                              │
│                    │   Rate Limiting      │                              │
│                    │   Prisma ORM         │                              │
│                    └──────────┬──────────┘                              │
│                  Deployed: Heroku (zovik-pos-backend.herokuapp.com)     │
└────────────────┬──────────────┴──────────────────────────────────────────┘
                 │                         │
        ┌────────▼────────┐    ┌──────────▼──────────┐
        │  Python FastAPI  │    │   Heroku Postgres    │
        │  ML Service      │    │   (Primary DB)       │
        │  - Demand        │    │                      │
        │    Forecasting   │    │   + Redis (optional) │
        │  - ETA Predict.  │    │   Rate-limit store   │
        │  Heroku (Python) │    └──────────────────────┘
        └──────────────────┘
                 │
     ┌───────────┴────────────┐
     │    External Services   │
     │  Supabase Storage      │
     │  Groq LLM/Vision API   │
     │  Hostinger SMTP        │
     │  PayFast Gateway       │
     └────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 19.x | UI framework |
| | Vite | 8.x | Build tool & dev server |
| | React Router | v7 | Client-side routing |
| | Socket.IO Client | 4.x | Real-time updates |
| | TanStack Query | 5.x | Server-state management |
| | Recharts | 3.x | Analytics charts |
| | Axios | 1.x | HTTP client |
| | Lucide React | 1.x | Icon library |
| **Backend** | Node.js | >=20.x | Runtime |
| | Express | 4.x | HTTP framework |
| | Socket.IO | 4.x | Real-time server |
| | Prisma ORM | 5.x | Database ORM & migrations |
| | PostgreSQL (via Prisma) | 15 | Primary database |
| | Redis (ioredis) | 5.x | Shared rate-limit store |
| | JWT (jsonwebtoken) | 9.x | Auth tokens |
| | Bcryptjs | 2.x | Password hashing |
| | Nodemailer | 8.x | Email delivery |
| | Zod | 3.x | Schema validation |
| | Tesseract.js | 7.x | OCR (inventory import) |
| | XLSX | 0.x | Excel file parsing |
| **AI Service** | Python | 3.10 | Runtime |
| | FastAPI | 0.110.0 | API framework |
| | Uvicorn | 0.28.0 | ASGI server |
| | scikit-learn | 1.4.x | ML models (RandomForest) |
| | pandas | 2.2.x | Data processing |
| | pydantic | 2.6.x | Schema validation |
| **Database** | Heroku Postgres | Essential-0 | Production DB |
| **Storage** | Supabase | 2.x | Menu image storage |
| **LLM** | Groq API | — | AI OCR / inventory parse |
| **Email** | Hostinger SMTP | — | Transactional email |
| **Payments** | PayFast | — | Payment gateway |
| **Hosting** | Vercel | — | Frontend |
| | Heroku | — | Backend + AI Service |

---

## 3. Frontend (React + Vite)

### 3.1 Directory Structure

```
frontend/
├── index.html                  # Entry HTML, meta tags, theme-color
├── vite.config.js              # Vite build config
├── vercel.json                 # SPA rewrite rules (/* -> /index.html)
├── .env / .env.example         # Environment variables
└── src/
    ├── main.jsx                # React 19 root, BrowserRouter
    ├── App.jsx                 # Route definitions, auth state, theme
    ├── index.css               # Global CSS tokens & base styles
    ├── components/
    │   ├── RoleLogin.jsx       # Role-selection landing page
    │   ├── Login.jsx           # Staff login form
    │   ├── StaffLogin.jsx      # Staff auth flow
    │   ├── CustomerDashboard.jsx    # Full customer menu UI
    │   ├── VendorDashboard.jsx      # Cashier POS terminal
    │   ├── KitchenDashboard.jsx     # Kitchen order queue
    │   ├── AdminDashboard.jsx       # Admin analytics panel
    │   ├── DemoRestrictionModal.jsx # Demo-mode gate
    │   ├── RoleChangeModal.jsx      # Role-switch confirmation
    │   ├── FAQModal.jsx             # Customer FAQ
    │   ├── InAppQRScanner.jsx       # QR code scanner
    │   ├── PhoneInput.jsx           # Phone number input
    │   ├── admin/
    │   │   └── views/
    │   │       └── AdminStaffView.jsx
    │   ├── common/
    │   │   └── BrandLogo.jsx
    │   └── ui/                      # Shared UI primitives
    ├── pages/
    │   ├── customer/
    │   │   ├── CustomerPortalPage.jsx    # QR landing / menu
    │   │   ├── CustomerCartPage.jsx      # Cart & checkout
    │   │   └── OrderTrackingPage.jsx     # Live order status
    │   ├── cashier/
    │   │   └── CashierPOSPage.jsx        # Cashier terminal
    │   ├── kitchen/
    │   │   └── KitchenBoardPage.jsx      # Kitchen display
    │   └── admin/
    │       └── AdminDashboardPage.jsx    # Admin panel
    ├── services/
    │   ├── api.js              # Axios instance + token refresh
    │   └── socket.js           # Socket.IO client manager
    ├── hooks/                  # Custom React hooks
    ├── utils/                  # Helper utilities
    └── styles/
        └── glass-theme.css     # Glassmorphism design system
```

### 3.2 Routing Structure

| Path | Component | Role | Auth Required |
|------|-----------|------|---------------|
| `/` | `RoleLogin` | All | No |
| `/customer` | `CustomerPortalPage` | CUSTOMER | No (guest OK) |
| `/customer/cart` | `CustomerCartPage` | CUSTOMER | No (guest OK) |
| `/customer/track/:orderId` | `OrderTrackingPage` | CUSTOMER | No |
| `/cashier` | `CashierPOSPage` | VENDOR | Yes |
| `/kitchen` | `KitchenBoardPage` | KITCHEN | Yes |
| `/admin` | `AdminDashboardPage` | ADMIN | Yes |

### 3.3 State Management

```
Frontend State Architecture

  Auth State (App.jsx):
  ├── user (role, id, name, email, isGuest)
  └── tokens (access, refresh) in localStorage

  Server State (TanStack Query):
  ├── Menu items (cached + invalidated on updates)
  ├── Orders (real-time via Socket.IO)
  ├── Inventory (admin panel)
  └── Analytics data (admin dashboard)

  Real-time State (Socket.IO):
  ├── Order status updates
  ├── Table session changes
  ├── Kitchen queue updates
  └── Payment confirmations
```

### 3.4 Environment Variables (Frontend)

```env
VITE_API_URL=https://zovik-pos-backend.herokuapp.com
VITE_SOCKET_URL=https://zovik-pos-backend.herokuapp.com
```

---

## 4. Backend (Node.js + Express)

### 4.1 Directory Structure

```
backend/
├── Procfile                    # Heroku: release (migrate) + web (start)
├── package.json                # Node.js deps + scripts
├── .env / .env.example         # All server env vars
├── eng.traineddata             # Tesseract OCR English model
├── prisma/
│   ├── schema.prisma           # Full DB schema (13+ models)
│   ├── migrations/             # Prisma migration history
│   ├── seed.js                 # Initial data seeder
│   └── seed_canteen_menu.js    # Canteen menu seeder
├── scripts/
│   ├── send-test-email.js      # Email test script
│   ├── renderEmailPreviews.js  # Email template preview
│   └── checkEmailPreviews.js   # Email preview validation
└── src/
    ├── server.js               # Express + Socket.IO entrypoint
    ├── config/
    │   ├── db.js               # Prisma client (pool config)
    │   ├── redis.js            # ioredis client + ping/withTimeout
    │   └── supabaseClient.js   # Supabase storage client
    ├── routes/
    │   ├── authRoutes.js       # /api/auth/*
    │   ├── sessionRoutes.js    # /api/sessions/*
    │   ├── cartRoutes.js       # /api/cart/*
    │   ├── tableRoutes.js      # /api/tables/*
    │   ├── menuRoutes.js       # /api/menu/*
    │   ├── orderRoutes.js      # /api/orders/*
    │   ├── paymentRoutes.js    # /api/payments/*
    │   ├── inventoryRoutes.js  # /api/inventory/*
    │   ├── adminRoutes.js      # /api/admin/*
    │   └── etaRoutes.js        # /api/eta/*
    ├── controllers/
    │   ├── authController.js
    │   ├── sessionController.js
    │   ├── cartController.js
    │   ├── tableController.js
    │   ├── menuController.js
    │   ├── orderController.js
    │   ├── paymentController.js
    │   ├── inventoryController.js
    │   ├── inventoryReceivingBatchController.js
    │   ├── adminController.js
    │   └── etaController.js
    ├── services/
    │   ├── emailService.js            # Nodemailer + SMTP
    │   ├── emailTemplateHelpers.js    # HTML email templates
    │   ├── groqService.js             # Groq LLM / Vision API
    │   ├── aiOcrService.js            # Tesseract + Groq OCR pipeline
    │   ├── aiService.js               # Proxy to Python AI service
    │   ├── etaService.js              # ETA calculation + ML call
    │   ├── aliasService.js            # Item alias matching
    │   ├── inventoryDeductionService.js
    │   ├── payfastService.js
    │   ├── disputeService.js
    │   ├── qrSecurityService.js
    │   ├── sweepJob.js
    │   └── apiIdempotencyCleanup.js
    ├── middleware/
    │   ├── authMiddleware.js          # JWT verify + RBAC
    │   ├── corsPolicy.js              # Dynamic CORS origin check
    │   ├── rateLimitMiddleware.js     # Rate limiting (Redis/memory)
    │   └── requestTimeout.js         # 25s request timeout guard
    ├── sockets/
    │   └── socket.js                 # Socket.IO event handlers
    ├── schemas/                       # Zod validation schemas
    └── utils/
        └── exceptionLogger.js        # Structured error logging
```

### 4.2 API Routes

| Route Group | Prefix | Key Responsibilities |
|-------------|--------|---------------------|
| Auth | `/api/auth` | Login, OTP, refresh token, logout |
| Sessions | `/api/sessions` | QR scan → session lifecycle |
| Cart | `/api/cart` | Add/remove/update cart items |
| Tables | `/api/tables` | CRUD + QR code generation |
| Menu | `/api/menu` | CRUD + Supabase image upload |
| Orders | `/api/orders` | Place order, status lifecycle |
| Payments | `/api/payments` | Cash/PayFast + webhook |
| Inventory | `/api/inventory` | Stock + OCR import + GRN |
| Admin | `/api/admin` | Reports, analytics, staff mgmt |
| ETA | `/api/eta` | Proxy to Python ML service |

### 4.3 Middleware Stack (in order)

```
Request
  │
  ├─ 1. Request ID generator (X-Request-ID header)
  ├─ 2. Trust proxy (Heroku only, production)
  ├─ 3. Security headers (nosniff, X-Frame-Options, etc.)
  ├─ 4. CORS (dynamic origin from CORS_ORIGINS env var)
  ├─ 5. Request Timeout Guard (25s)
  ├─ 6. Body parsers (1mb default, 10mb for uploads)
  ├─ 7. Static files (/uploads, 1-year cache)
  ├─ 8. Socket.IO initialization
  ├─ 9. Rate limiter (Redis-backed or in-memory)
  ├─ 10. Route handlers
  ├─ 11. 404 handler
  └─ 12. Centralized error handler
```

### 4.4 Procfile (Heroku)

```
release: npx prisma migrate deploy
web: node src/server.js
```

The `release` phase automatically runs DB migrations on every deploy.

---

## 5. AI Service (Python + FastAPI)

### 5.1 Directory Structure

```
ai-service/
├── Procfile            # web: uvicorn main:app --host 0.0.0.0 --port $PORT
├── requirements.txt    # fastapi, uvicorn, pydantic, pandas, scikit-learn
├── runtime.txt         # python-3.10.x
├── .env.example        # LOG_DIR, LOG_TIMEZONE, LOG_LEVEL
├── main.py             # FastAPI app + ETA model + endpoints
├── model.py            # Demand forecasting ML logic
├── train_model.py      # Model training script
├── eta_model.pkl       # Serialized RandomForest model
├── canteen_orders.csv  # Training data sample
└── exception_logger.py # Structured exception logging
```

### 5.2 ML Models

#### Demand Forecasting (`model.py`)
- **Algorithm**: Rule-based + historical-weighted forecasting
- **Features**: weekday, month, season, promotions, exams_season, weather, historical_sales
- **Output**: `forecast` (units), `confidence` (0-1), `percent_change`, `note`

#### ETA Prediction (`main.py`)
- **Algorithm**: RandomForestRegressor (50 estimators)
- **Features**: base_eta, queue_length, hour, day_of_week, is_peak_hour, kitchen_load, historical_delay
- **Training**: 200 synthetic samples generated at startup
- **Fallback**: Formula-based if sklearn unavailable
- **Output**: `estimated_time` (minutes)

### 5.3 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info |
| POST | `/predict` | Demand forecast |
| POST | `/predict-eta` | ETA prediction |

---

## 6. Database Layer

### 6.1 Key Prisma Models

| Model | Purpose |
|-------|---------|
| `Branch` | Multi-branch support |
| `Table` | Physical tables with HMAC-signed QR tokens |
| `Session` | Customer table sessions (idle timeout) |
| `User` | All roles: ADMIN, VENDOR, KITCHEN, CUSTOMER |
| `MenuItem` | Menu catalog with price & availability |
| `Order` | Full lifecycle: PENDING → PAID |
| `OrderItem` | Line items with price snapshot |
| `Payment` | Cash / PayFast payment records |
| `InventoryItem` | Stock levels with min-stock alerts |
| `InventoryReceiving` | Goods received notes (GRN) |
| `AuditLog` | Admin action history |
| `Dispute` | Order complaint tracking |
| `OrderStatusHistory` | Full status-change audit trail |

### 6.2 Schema Summary

```
Branch (1) ──< Table (1) ──< Session
       (1) ──< User
       (1) ──< MenuItem
       (1) ──< Order ──< OrderItem
                     ──< Payment
                     ──< OrderStatusHistory
                     ──< Dispute
       (1) ──< InventoryItem
       (1) ──< InventoryReceiving
User ──< AuditLog
     ──< InventoryLog
```

### 6.3 Connection Config

```
# Heroku Essential-0: max 10 connections
DATABASE_URL="postgresql://...?connection_limit=10&pool_timeout=15&sslmode=no-verify"
```

---

## 7. External Services

| Service | Purpose | Key Env Vars |
|---------|---------|-------------|
| **Supabase Storage** | Menu images bucket | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| **Groq API** | LLM + Vision for OCR | `GROQ_API_KEY`, `GROQ_MODEL` |
| **Hostinger SMTP** | OTP + receipt emails | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| **PayFast** | Online payments | `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` |
| **Redis** | Shared rate-limit store | `REDIS_URL` |

> **Warning**: Hostinger email trial expires **2026-11-22** — renew before viva!

---

## 8. Real-Time Communication (Socket.IO)

### Events

| Event | Direction | Trigger |
|-------|-----------|---------|
| `order:new` | Server → Kitchen | New order placed |
| `order:statusUpdate` | Server → Customer/Cashier | Status changed |
| `kitchen:orderReady` | Server → Cashier/Customer | Order ready |
| `payment:confirmed` | Server → All | Payment processed |
| `table:sessionCreated` | Server → Cashier | Customer scanned QR |
| `table:sessionEnded` | Server → All | Session closed |

### Rooms
- Per `tableId` — customer gets updates for their table
- Per `branchId` — kitchen/cashier gets all branch orders

---

## 9. Security Architecture

### Authentication Flow
```
Staff:    POST /api/auth/login → JWT access token + refresh token
Customer: POST /api/auth/send-otp → email OTP → POST /api/auth/verify-otp → tokens
Refresh:  POST /api/auth/refresh → new access token
Protected: Authorization: Bearer <token> → authMiddleware verifies JWT
```

### RBAC Roles

| Role | Capabilities |
|------|-------------|
| `ADMIN` | Full access: reports, staff, settings |
| `VENDOR` | POS terminal, orders, payments |
| `KITCHEN` | Kitchen board, status updates |
| `CUSTOMER` | Browse menu, order, track |

### Security Features
- **QR Tokens**: HMAC-signed with `QR_SECRET` (prevents forgery)
- **Production Secrets Check**: App refuses to start with default JWT secrets
- **Rate Limiting**: Redis-backed (or in-memory), per-IP, 429 response
- **Request Timeout**: 25s guard prevents hung requests
- **Security Headers**: nosniff, X-Frame-Options, Referrer-Policy

---

## 10. Data Flow Diagrams

### Order Flow
```
Customer scans QR → POST /sessions (create session)
→ GET /menu (browse) → POST /cart (add items)
→ POST /orders (place order)
  [Socket: order:new → Kitchen sees it]
→ Kitchen: PUT /orders/:id/status (PREPARING → READY)
  [Socket: order:statusUpdate → Customer tracking page]
→ Cashier: POST /payments (cash/PayFast)
  [Socket: payment:confirmed]
→ inventoryDeductionService auto-deducts stock
```

### ETA Flow
```
Order placed → GET /api/eta
→ etaService calculates queue_length, kitchen_load
→ POST http://ai-service/predict-eta
→ RandomForest returns minutes
→ Socket.IO broadcasts to customer
```

### OCR Inventory Import Flow
```
Admin uploads invoice image
→ POST /api/inventory/ocr-import
→ Tesseract.js extracts raw text
→ Groq Vision API parses structured JSON
→ aliasService matches to existing items
→ POST /api/inventory/receiving-batch
→ Stock levels updated + InventoryLog created
```

---

## 11. API Reference Summary

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Staff login |
| `/api/auth/send-otp` | POST | Customer OTP |
| `/api/auth/verify-otp` | POST | OTP verify |
| `/api/auth/refresh` | POST | Token refresh |
| `/api/sessions` | POST | Create table session |
| `/api/cart` | GET/POST/PUT/DELETE | Cart management |
| `/api/menu` | GET/POST/PUT/DELETE | Menu CRUD |
| `/api/menu/upload-image` | POST | Supabase image upload |
| `/api/orders` | GET/POST | Orders |
| `/api/orders/:id/status` | PUT | Status update |
| `/api/payments` | POST | Process payment |
| `/api/payments/payfast/notify` | POST | PayFast webhook |
| `/api/inventory` | GET/PUT | Stock management |
| `/api/inventory/ocr-import` | POST | AI OCR import |
| `/api/inventory/receiving-batch` | POST | GRN record |
| `/api/admin/reports/sales` | GET | Sales analytics |
| `/api/admin/staff` | GET/POST/PUT | Staff management |
| `/api/eta` | GET | ML-predicted ETA |
| `/health` | GET | Heroku health check |
| `/ready` | GET | DB + Redis readiness |

---

## 12. Environment Variables Reference

### Frontend

| Variable | Production Value |
|----------|----------------|
| `VITE_API_URL` | `https://zovik-pos-backend.herokuapp.com` |
| `VITE_SOCKET_URL` | `https://zovik-pos-backend.herokuapp.com` |

### Backend

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Heroku Postgres connection string |
| `JWT_SECRET` | Strong random string (32+ chars) |
| `JWT_REFRESH_SECRET` | Strong random string (32+ chars) |
| `QR_SECRET` | Strong random string (32+ chars) |
| `FRONTEND_URL` | Vercel URL for CORS |
| `CORS_ORIGINS` | Vercel URL (comma-separated if multiple) |
| `AI_SERVICE_URL` | Heroku AI service URL |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `support@zovikpos.store` |
| `SMTP_PASS` | Email password |
| `GROQ_API_KEY` | Groq API key |
| `REDIS_URL` | Heroku Redis add-on URL (optional) |

### AI Service

| Variable | Notes |
|----------|-------|
| `LOG_TIMEZONE` | `Asia/Karachi` |
| `LOG_LEVEL` | `info` |

---

*ZovikPOS FYP 2026 | Architecture Version 1.0*
