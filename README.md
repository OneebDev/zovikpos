# 🍽️ ZovikPOS — AI-Powered Smart Canteen & Point of Sale System

> **A Full-Stack, Enterprise-Grade Real-Time AI POS and Intelligent Inventory Management System for Restaurants, Canteens, and Multi-Branch Food Enterprises.**

---

## 📋 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Tech Stack & Architecture](#-tech-stack--architecture)
3. [Prerequisites & System Requirements](#-prerequisites--system-requirements)
4. [Complete Installation & Setup Guide](#-complete-installation--setup-guide)
   - [Step 1: Clone Repository](#step-1-clone-repository)
   - [Step 2: Environment Configuration (`.env`)](#step-2-environment-configuration-env)
   - [Step 3: Backend Node.js Service](#step-3-backend-nodejs-service)
   - [Step 4: Frontend React Web Application](#step-4-frontend-react-web-application)
   - [Step 5: Python Machine Learning AI Service](#step-5-python-machine-learning-ai-service)
5. [User Roles & Login Credentials](#-user-roles--login-credentials)
6. [Exhaustive Screen & Dashboard Feature Documentation](#-exhaustive-screen--dashboard-feature-documentation)
   - [1. Executive Admin Command Center](#1-executive-admin-command-center)
   - [2. Menu Management Engine](#2-menu-management-engine)
   - [3. Recipe Builder & Food Cost Mapping (Step 1)](#3-recipe-builder--food-cost-mapping-step-1)
   - [4. Stock Catalog & Multi-Branch Inventory](#4-stock-catalog--multi-branch-inventory)
   - [5. Automated Inventory Receiving (Excel Import & AI Vision OCR)](#5-automated-inventory-receiving-excel-import--ai-vision-ocr)
   - [6. Batch Expiry & Freshness Isolation Engine](#6-batch-expiry--freshness-isolation-engine)
   - [7. Costs, Margins & Profitability Engine](#7-costs-margins--profitability-engine)
   - [8. Real AI Demand Intelligence & Forecasting](#8-real-ai-demand-intelligence--forecasting)
   - [9. Business Reports, CSV & PDF Export Engine](#9-business-reports-csv--pdf-export-engine)
   - [10. Cashier / Vendor Counter POS Dashboard](#10-cashier--vendor-counter-pos-dashboard)
   - [11. Real-Time Kitchen Display System (KDS)](#11-real-time-kitchen-display-system-kds)
   - [12. Customer Mobile & QR Table Ordering View](#12-customer-mobile--qr-table-ordering-view)
   - [13. Staff & User Permission Management](#13-staff--user-permission-management)
   - [14. Read-Only Demo Sandbox Mode](#14-read-only-demo-sandbox-mode)
   - [15. System Audit Logs](#15-system-audit-logs)
7. [Automatic Stock Deductions & Refund Lifecycle](#-automatic-stock-deductions--refund-lifecycle)
8. [Multi-Key & Multi-Model AI Resilience Engine](#-multi-key--multi-model-ai-resilience-engine)
9. [Database Schema & Prisma ORM Architecture](#-database-schema--prisma-orm-architecture)
10. [API Endpoint Reference Guide](#-api-endpoint-reference-guide)
11. [Performance Optimizations & Caching Engine](#-performance-optimizations--caching-engine)
12. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 Executive Summary

**ZovikPOS** is a next-generation Point of Sale and Inventory Intelligence platform designed specifically for fast-paced food outlets, restaurant chains, and university canteens. It bridges the gap between customer QR ordering, cashier billing, kitchen display systems, and back-office inventory logistics using real-time WebSockets, Machine Learning demand prediction, and Multimodal Artificial Intelligence.

### Core Value Propositions:
- **Zero Stock Leakage:** Automatic recipe-based raw ingredient stock deductions (e.g. subtracting 150g Beef, 1 Bun, 20ml Sauce on every paid order).
- **Multimodal AI Bill Scanner:** Upload paper invoices, photos, or PDFs — Groq AI Vision automatically extracts supplier, invoice number, items, quantities, and expiry dates into draft inwarding forms.
- **Excel Stock Auto-Matching:** Upload supplier Excel sheets with fuzzy matching algorithms to auto-link items into your inventory catalog.
- **Multi-Key LLM Failover:** 100% AI uptime guaranteed via key rotation and fallback across `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, and `allam-2-7b`.
- **Batch-by-Batch Expiry Tracking:** Track freshness countdowns per inventory lot with non-destructive batch editing.
- **High-Speed Caching:** In-memory caching layer guarantees **< 1ms response times** when navigating admin views.

---

## 🛠 Tech Stack & Architecture

```
                               ┌─────────────────────────┐
                               │   Customer Mobile App   │
                               │   (React 19 / Vite UI)  │
                               └────────────┬────────────┘
                                            │ HTTP / WebSockets
                                            ▼
┌──────────────────────────┐   ┌─────────────────────────┐   ┌──────────────────────────┐
│  Cashier / Vendor POS    ├──►│ Node.js Express Backend ◄───┤ Admin Executive Command  │
│  (React 19 + Lucide UI)  │   │  (Prisma ORM + Sockets) │   │ (React 19 + Recharts)    │
└──────────────────────────┘   └────────────┬────────────┘   └──────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │                            │                            │
               ▼                            ▼                            ▼
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│ PostgreSQL Database      │   │ Python FastAPI ML Engine │   │ Groq Vision & LLM APIs   │
│ (Hosted on Supabase)     │   │ (scikit-learn Demand)    │   │ (Multi-Key Rotation)     │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

| Layer | Component | Technologies |
|---|---|---|
| **Frontend UI** | Web Application | React 19, Vite, Vanilla CSS / TailwindCSS, Lucide Icons, Recharts |
| **Backend API** | Application Server | Node.js, Express, Prisma ORM, Socket.io, JWT Authentication |
| **Database** | Database Engine | PostgreSQL (Hosted on Supabase Cloud with Connection Pooling) |
| **AI ML Engine**| Forecasting Service| Python 3.10+, FastAPI, Uvicorn, scikit-learn, NumPy |
| **AI LLM API**  | Vision & NLP | Groq Cloud Multimodal API (`qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `allam-2-7b`) |
| **OCR Fallback**| Client OCR Engine| Tesseract.js |
| **Notifications**| Email & OTP | Nodemailer (SMTP Authentication) |

---

## ⚡ Prerequisites & System Requirements

Ensure the following runtimes are installed on your host system:

- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org))
- **Python**: `v3.10.0` or higher ([Download Python](https://python.org))
- **Git**: `v2.30.0` or higher ([Download Git](https://git-scm.com))
- **Package Managers**: `npm` (included with Node.js) and `pip` (included with Python)

---

## 💻 Complete Installation & Setup Guide

### Step 1: Clone Repository
Open your terminal and clone the official repository:
```bash
git clone https://github.com/Bilal-Ahmed35/ZOVIK-POS.git
cd ZOVIK-POS
git checkout oneeb
```

---

### Step 2: Environment Configuration (`.env`)
Create a `.env` file inside the `backend/` directory:

```bash
# Path: backend/.env
```

Add the following environment variables:

```env
PORT=5001
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[DATABASE_PASSWORD]@[POOLER_HOST]:5432/postgres?connection_limit=5&pool_timeout=15"
JWT_SECRET="[GENERATE_A_UNIQUE_SECRET]"
JWT_REFRESH_SECRET="[GENERATE_A_DIFFERENT_UNIQUE_SECRET]"
FRONTEND_URL="http://localhost:5173"
AI_SERVICE_URL="http://localhost:8000"
QR_SECRET="[GENERATE_A_UNIQUE_SECRET]"

# Supabase Cloud Database Config
SUPABASE_URL="https://ufcphvkxlzjcksmahvwh.supabase.co"
SUPABASE_ANON_KEY="[YOUR_SUPABASE_ANON_KEY]"
SUPABASE_SERVICE_KEY="[YOUR_SUPABASE_SERVICE_ROLE_KEY]"

# SMTP Email OTP Settings
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_USER="[YOUR_SMTP_EMAIL]"
SMTP_PASS="[YOUR_SMTP_APP_PASSWORD]"

# Groq Multimodal AI Keys (Multi-Key Failover Engine)
GROQ_API_KEY="[YOUR_GROQ_API_KEY]"
GROQ_API_KEY="[YOUR_GROQ_API_KEY]"
GROQ_API_KEY="[YOUR_GROQ_API_KEY]"
GROQ_API_KEY="[YOUR_GROQ_API_KEY]"
GROQ_MODEL="qwen/qwen3.8-27b"
```

---

### Step 3: Backend Node.js Service
Open Terminal #1:
```bash
cd backend
npm install
npx prisma generate
npm run dev
```
> ✅ **Backend Server runs on:** `http://localhost:5001`

---

### Step 4: Frontend React Web Application
Open Terminal #2:
```bash
cd frontend
npm install
npm run dev
```
> ✅ **Frontend App runs on:** `http://localhost:5173`

---

### Step 5: Python Machine Learning AI Service
Open Terminal #3:
```bash
cd ai-service
python -m venv venv
```

**Activate Virtual Environment:**
- **Windows (PowerShell):** `venv\Scripts\activate`
- **Mac / Linux:** `source venv/bin/activate`

**Install Dependencies & Run:**
```bash
pip install -r requirements.txt
python main.py
```
> ✅ **Python AI Service runs on:** `http://localhost:8000`

---

## 🔑 User Roles & Login Credentials

| User Role | Login URL | Email Address | Password | Access Scope |
|---|---|---|---|---|
| **System Admin** | `/admin/login` | `admin@pos.com` | `password123` | Full Administrative Control, Financials, Staff, Multi-Branch |
| **Cashier / Vendor**| `/cashier/login`| `vendor@pos.com` | `password123` | Counter Billing, Table Grid, Inventory Inwarding, Recipes |
| **Kitchen Staff** | `/kitchen/login`| `kitchen@pos.com` | `password123` | Live Kitchen Display (KDS), Order Status Bumping |
| **Customer** | `/customer/login`| Mobile / Email OTP | Email OTP Code | QR Table Order Placement, Cart, Real-Time Socket Status |
| **Demo Sandbox** | `/admin/login` | `demo.admin@testpos.local` | `password123` | **Read-Only View Mode** (Write/delete & downloads locked) |

---

## 📖 Exhaustive Screen & Dashboard Feature Documentation

### 1. Executive Admin Command Center
- **Path:** `/admin/dashboard`
- **Purpose:** Provides high-level operational intelligence for managers and business owners.
- **Key Cards & Features:**
  - **Total Revenue Card:** Displays gross revenue for selected time window (*Today, Week, Month, Year*) in Pakistani Rupees (`Rs.`).
  - **Completed Orders Count:** Live tally of processed, paid orders.
  - **Average Order Value (AOV):** Calculates average transaction size (`Revenue / Total Orders`).
  - **Active Orders Queue:** Real-time counter of orders in `PENDING`, `PAID`, `PREPARING`, or `READY` states.
  - **Low Stock Risk Alerts:** Highlights ingredients below minimum safety threshold.
  - **POS Data Confidence Score:** Displays system data reliability score (*LOW, MEDIUM, HIGH*) based on historical transaction span.
  - **AI Kitchen Prep Time Metric:** Computes average prep time evaluated against actual order kitchen completion timestamps.
  - **Revenue & Payment Breakdown Chart:** Recharts visual breakdown of payments (*Cash, Card, Online QR*).

---

### 2. Menu Management Engine
- **Path:** `/admin/menu`
- **Purpose:** Centralized catalog builder for restaurant dishes, drinks, and combos.
- **Features:**
  - **Add / Edit Menu Item Modal:** Configure item name, group name, category, price, preparation time, and image URL.
  - **Variant Grouping:** Group items by variants (e.g. *Zinger Burger Single*, *Zinger Burger Double*).
  - **Availability Toggle:** Enable/disable menu items instantly across cashier POS and customer QR views.
  - **Stock Availability Badge:** Displays real-time stock state (*In Stock, Out of Stock, Low Ingredient Stock*).

---

### 3. Recipe Builder & Food Cost Mapping (Step 1)
- **Path:** `/admin/inventory/recipes`
- **Purpose:** Maps raw inventory ingredients to menu items (Step 1) to enable automatic stock deduction and profit calculations.
- **Features:**
  - **Step 1 Menu Item Selection:** Select any dish from the menu catalog to edit or view its recipe map.
  - **Dual Ingredient Mapping (Manual + AI):** Combine manual ingredient additions with AI suggestions in a single form.
  - **`✨ AI Suggest Ingredients` Button:** Invokes LLM intelligence to match dish names to catalog stock (e.g. mapping *Chicken Fillet*, *Bun*, *Cheese* to *Zinger Burger*).
  - **Unit Conversion Engine:** Seamlessly converts recipe units (`KG`, `G`, `L`, `ML`, `PCS`, `DOZEN`, `PACK`) to catalog units.
  - **Real-Time Financial Summary:** Calculates line cost per ingredient, total recipe cost, gross margin %, and food cost ratio.

---

### 4. Stock Catalog & Multi-Branch Inventory
- **Path:** `/admin/inventory`
- **Purpose:** Catalog management for all raw stock items across branches.
- **Features:**
  - **Catalog Table:** View stock levels, cost prices, unit measurements, categories, and branch locations.
  - **Minimum Safety Thresholds:** Set minimum stock alerts (e.g. alert when Cooking Oil drops below 10 Liters).
  - **Branch Selector:** Switch views between *All Branches*, *Main Campus Canteen*, or *Block B Extension*.

---

### 5. Automated Inventory Receiving (Excel Import & AI Vision OCR)
- **Path:** `/admin/inventory/receiving`
- **Purpose:** Stock inwarding workflow supporting manual entry, Excel bulk upload, and multimodal paper invoice scanning.
- **Features:**
  - **Method 1 — Manual Touch Form:** Stacked item rows for manual receiving entry.
  - **Method 2 — Upload Excel / CSV:** Import stock Excel files. Automatically fuzzy-matches item names against catalog items.
  - **Method 3 — Upload Invoice (AI Multimodal Vision):** Uses Groq AI Vision (`qwen/qwen3.8-27b`) to scan photo receipts and PDFs, extracting supplier name, invoice number, items, quantities, batch numbers, and expiry dates directly into draft stock records.
  - **Smart Metadata Auto-Generation:**
    - **Internal Reference (`RCV-YYYYMMDD-XXXX`)**: Auto-generated upon file upload; editable or re-generatable via `[ 🔄 ]`.
    - **Supplier Invoice Number (`INV-YYYYMMDD-XXXX`)**: Auto-generated if omitted in file; editable via `[ 🔄 ]`.
    - **Row Batch Numbers (`BATCH-YYYYMMDD-XXXX`)**: Auto-generated for every item row; editable per row via `[ 🔄 ]`.

---

### 6. Batch Expiry & Freshness Isolation Engine
- **Path:** `/admin/inventory/expiries`
- **Purpose:** Lot-level tracking of perishable inventory items.
- **Features:**
  - **Days Left Countdown:** Live calculation of days remaining until expiration.
  - **Status Badges:** Color-coded badges (*Expired, Expiring Today, Within 3 Days, Within 7 Days, Within 30 Days, Fresh, No Expiry*).
  - **View / Edit Batch Modal:** Open batch details in a centered React Portal modal to update batch numbers or expiry dates.

---

### 7. Costs, Margins & Profitability Engine
- **Path:** `/admin/inventory/margins`
- **Purpose:** Provides profitability metrics per dish based on live ingredient cost prices.
- **Features:**
  - **Profitability Metrics:** Selling Price, Calculated Recipe Cost, Gross Profit (Rs.), and Gross Margin %.
  - **Status Indicators:** Highlights high-margin items vs unprofitable dishes (e.g. food cost exceeding 40%).

---

### 8. Real AI Demand Intelligence & Forecasting
- **Path:** `/admin/ai-insights`
- **Purpose:** Machine Learning demand prediction and executive advice.
- **Features:**
  - **Database-Driven Analytics:** Uses 100% real factual sales logs.
  - **Multi-Key LLM Engine:** Powered by Groq LLM API with key rotation and fallback across `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, and `allam-2-7b`.
  - **Actionable Optimization Advice:** Generates executive advice on supplier purchasing and stock reordering.

---

### 9. Business Reports, CSV & PDF Export Engine
- **Path:** `/admin/reports`
- **Purpose:** Audit-ready financial and inventory reporting.
- **Features:**
  - **Report Tabs:** Sales Summary, Product Performance, Inventory Movement.
  - **One-Click CSV Export:** Download structured CSV audit files.
  - **Printable PDF Reports:** Formatted PDF printing layout.

---

### 10. Cashier / Vendor Counter POS Dashboard
- **Path:** `/cashier/dashboard`
- **Purpose:** High-speed counter billing and table order management interface.
- **Features:**
  - **Counter POS Grid:** Select menu items, customize quantities, and bill walk-in customers.
  - **Table Order Manager:** View and confirm incoming QR table orders.
  - **Payment Confirmation:** Accept Cash, Card, or Online Payments and print receipts.

---

### 11. Real-Time Kitchen Display System (KDS)
- **Path:** `/kitchen/dashboard`
- **Purpose:** Kitchen order execution board.
- **Features:**
  - **Live Order Cards:** Displays pending orders with itemized lists, table numbers, and prep instructions.
  - **Status Bumping:** Transition orders (*Pending → Cooking → Ready → Served*).
  - **Audio & Visual Alerts:** Plays sound alerts upon receiving new orders via WebSockets.

---

### 12. Customer Mobile & QR Table Ordering View
- **Path:** `/customer/menu`
- **Purpose:** Frictionless QR table ordering for customers.
- **Features:**
  - **OTP Authentication:** Login via Email OTP code.
  - **Table QR Scanner / Selector:** Table assignment via QR code.
  - **Interactive Cart & Checkout:** Add items, view prep times, and place orders.
  - **Live Order Status Tracking:** Socket.io updates for order status transitions.

---

### 13. Staff & User Permission Management
- **Path:** `/admin/staff`
- **Purpose:** User account administration.
- **Features:**
  - Manage staff roles (*ADMIN, VENDOR, KITCHEN, CUSTOMER*).
  - Toggle account status (*Active / Deactivated*).

---

### 14. Read-Only Demo Sandbox Mode
- **Purpose:** Safe evaluation mode for prospective buyers and evaluators.
- **Features:**
  - **HTTP Mutation Lock (`demoGuardMiddleware.js`):** Blocks all `POST`, `PUT`, `DELETE`, and `PATCH` requests for Demo accounts (`isDemo: true`).
  - **Export & Download Lock (`exportUtils.js`):** Blocks CSV and PDF exports for Demo accounts.
  - **UI Indicators:** Persistent `🔒 READ-ONLY DEMO MODE` header badge and restriction modal popups.

---

### 15. System Audit Logs
- **Path:** `/admin/audit-logs`
- **Purpose:** Full audit trail tracking user actions, timestamps, and IP addresses.

---

## 🔄 Automatic Stock Deductions & Refund Lifecycle

```
[ Customer Places Order ] ──► [ Cashier Confirms Payment (PAID) ]
                                            │
                                            ▼
                        [ Trigger: deductInventoryForConfirmedOrder ]
                                            │
                                            ├─► 1. Convert Units (G -> KG, ML -> L)
                                            ├─► 2. Subtract stockLevel from InventoryItem
                                            ├─► 3. Log atomic USAGE in InventoryLog
                                            └─► 4. Decrement MenuItem Display Stock
```

- **Order Confirmation:** When an order transitions to `PAID`, `deductInventoryForConfirmedOrder` fetches recipe items, converts units, decrements inventory stock, and logs atomic `USAGE` records.
- **Order Cancellation / Refund:** Canceling or refunding an order invokes `restoreInventoryForOrder`, restoring stock levels atomically.

---

## 🛡️ Multi-Key & Multi-Model AI Resilience Engine

To guarantee **100% AI uptime**, `groqService.js` implements a two-tier fallback matrix:

```
                  ┌─────────────────────────────────────────┐
                  │          Incoming AI Request            │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │    Round-Robin Key Selection (Key 1..4)  │
                  └────────────────────┬────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │                                             │
      HTTP 200 (Success)                           HTTP 429 / 401 / 503
                │                                             │
                ▼                                             ▼
        [ Return Response ]                        [ Rotate to Next API Key ]
                                                              │
                                                     (All Keys Exhausted?)
                                                              │
                                                              ▼
                                                   [ Fallback to Next Model ]
                                                (qwen -> gpt-120b -> gpt-20b -> allam)
```

---

## 🗄️ Database Schema & Prisma ORM Architecture

Key database models in `backend/prisma/schema.prisma`:

- `User`: System accounts with roles (*ADMIN, VENDOR, KITCHEN, CUSTOMER*), branch associations, and `isDemo` flags.
- `Branch`: Outlets and canteen locations.
- `MenuItem`: Menu catalog items with prices, stock counts, prep times, and recipe mappings.
- `RecipeItem`: Junction table linking `MenuItem` to `InventoryItem` with quantities and units.
- `InventoryItem`: Raw stock catalog with stock levels, cost prices, units, and supplier references.
- `InventoryLog`: Atomic logs tracking stock movement types (*PURCHASE, USAGE, ADJUSTMENT, RETURN, SPOILAGE*).
- `Order` & `OrderItem`: Customer orders and line items.
- `DemandForecast`: Machine Learning demand predictions.

---

## 🔌 API Endpoint Reference Guide

| Endpoint Route | HTTP Method | Role Required | Description |
|---|---|---|---|
| `/api/auth/login` | `POST` | Public | Authenticates user and returns JWT tokens |
| `/api/admin/dashboard-stats` | `GET` | `ADMIN` | Returns executive dashboard metrics (15s cached) |
| `/api/menu` | `GET` | Public | Returns menu items catalog (10s cached) |
| `/api/menu` | `POST` | `ADMIN`, `VENDOR` | Creates a new menu item |
| `/api/inventory` | `GET` | `ADMIN`, `VENDOR` | Returns inventory catalog items |
| `/api/inventory/recipes/:id` | `GET` | `ADMIN`, `VENDOR` | Returns recipe map for menu item |
| `/api/inventory/recipes/:id` | `POST` | `ADMIN`, `VENDOR` | Saves recipe mapping for menu item |
| `/api/inventory/recipes/ai-suggest` | `POST` | `ADMIN`, `VENDOR` | Generates AI recipe suggestions |
| `/api/inventory/receivings/import/preview` | `POST` | `ADMIN`, `VENDOR` | Previews Excel stock upload |
| `/api/inventory/receivings/ocr-preview` | `POST` | `ADMIN`, `VENDOR` | Previews AI Vision invoice scan |
| `/api/orders` | `POST` | Public / Customer| Places a new order |
| `/api/payments/confirm` | `POST` | `ADMIN`, `VENDOR` | Confirms payment and triggers inventory deduction |

---

## ⚡ Performance Optimizations & Caching Engine

1. **In-Memory Analytical Caching**:
   - `getDashboardStats` caches response payloads for **15 seconds**, serving subsequent dashboard loads in **< 1ms**.
   - `getAllItems` caches menu catalog queries for **10 seconds**, invalidating automatically on menu mutations.
2. **PostgreSQL Connection Pooling**:
   - `DATABASE_URL` query parameters (`?connection_limit=5&pool_timeout=15`) keep active client connections within Supabase caps.
3. **Frontend Asset Optimization**:
   - Production bundle compiled via Vite, minimizing CSS/JS chunk sizes.

---

## ❓ Troubleshooting & FAQ

### Q1: Ports 5001, 5173, or 8000 are already in use.
- **Fix:** Change `PORT=5001` in `backend/.env` or kill active node processes using:
  ```bash
  npx kill-port 5001 5173 8000
  ```

### Q2: Database connection error `FATAL: max clients reached`.
- **Fix:** Ensure `DATABASE_URL` in `backend/.env` includes `?connection_limit=5&pool_timeout=15`.

### Q3: AI requests return rate limit errors.
- **Fix:** The system automatically rotates through `GROQ_API_KEY_1` to `GROQ_API_KEY_4` and falls back across working models. Ensure at least one valid key is present in `.env`.

---

## 📜 License & Copyright

© 2026 **ZovikPOS Enterprise Systems**. All Rights Reserved.  
Built for modern canteens, restaurants, and food enterprises.