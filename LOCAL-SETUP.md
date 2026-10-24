# 💻 Local Setup Guide — ZOVIK POS

Complete step-by-step guide to run **ZOVIK POS** locally on Windows, macOS, or Linux.

---

## 📋 System Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Python**: `3.10+` or `3.11+`
- **PostgreSQL**: `v15+` or `v16+` (or a remote Neon/Supabase PostgreSQL connection URI)
- **Git**
- **npm** (comes with Node.js)

---

## 📁 Repository Structure

```
AI-Powered-POS/
├── backend/            # Express.js REST API + Prisma ORM + Socket.io
├── frontend/           # React 18 + Vite + Tailwind/CSS System + PWA
├── ai-service/         # FastAPI / Python OCR Vision & Groq/ML Services
├── docs/               # Architecture diagrams and specifications
└── package.json        # Root scripts (if applicable)
```

---

## 1️⃣ Backend Setup (`backend/`)

### Step 1: Navigate and install dependencies
```powershell
cd d:\FYP\AI-Powered-POS-main\backend
npm install
```

### Step 2: Configure Environment Variables
Create or verify `.env` inside `backend/`:
```env
PORT=5000
NODE_ENV=development

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://username:password@localhost:5432/zovikpos?schema=public"

# JWT Authentication
JWT_SECRET="your-super-strong-jwt-secret-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# Client CORS
CLIENT_URL="http://localhost:5173"

# SMTP Email Configuration (Hostinger / Custom SMTP)
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER="support@zovikpos.store"
SMTP_PASS="YourEmailPasswordHere"
SMTP_FROM="ZOVIK POS Support <support@zovikpos.store>"
EMAIL_FROM="support@zovikpos.store"

# AI Vision Service
AI_SERVICE_URL="http://127.0.0.1:8000"
GROQ_API_KEYS="gsk_key1,gsk_key2"

# PayFast Payment Sandbox Gateway
PAYFAST_MERCHANT_ID="10000100"
PAYFAST_SECURE_KEY="46f0cd694581a"
PAYFAST_SANDBOX="true"
PAYFAST_RETURN_URL="http://localhost:5173/customer/payment-success"
PAYFAST_CANCEL_URL="http://localhost:5173/customer/payment-cancel"
```

### Step 3: Run Database Migrations & Prisma Client
```powershell
npx prisma generate
npx prisma db push
# or run existing migrations:
npx prisma migrate deploy
```

*(Optional) Seed initial users and demo menu:*
```powershell
node prisma/seed.js
```

### Step 4: Start Backend Dev Server
```powershell
npm run dev
```
> Server runs on: **http://localhost:5000**

---

## 2️⃣ Frontend Setup (`frontend/`)

### Step 1: Navigate and install dependencies
```powershell
cd d:\FYP\AI-Powered-POS-main\frontend
npm install
```

### Step 2: Configure Environment Variables
Create or verify `.env` inside `frontend/`:
```env
VITE_API_URL="http://localhost:5000/api"
VITE_SOCKET_URL="http://localhost:5000"
```

### Step 3: Start Frontend Dev Server
```powershell
npm run dev
```
> Frontend runs on: **http://localhost:5173**

---

## 3️⃣ AI Microservice Setup (`ai-service/`)

### Step 1: Navigate and create Python Virtual Environment
```powershell
cd d:\FYP\AI-Powered-POS-main\ai-service

python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# Mac/Linux:
# source venv/bin/activate
```

### Step 2: Install Python dependencies
```powershell
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables
Create `.env` inside `ai-service/`:
```env
PORT=8000
GROQ_API_KEY="gsk_your_groq_api_key_here"
```

### Step 4: Run the AI Service
```powershell
python main.py
# or uvicorn main:app --reload --port 8000
```
> AI Service runs on: **http://127.0.0.1:8000**

---

## 4️⃣ Verifying Everything Locally

1. Open **http://localhost:5173/customer** in your browser to browse the customer portal.
2. Open **http://localhost:5173/admin/login** to test Admin controls.
3. Open **http://localhost:5173/cashier/login** to test Cashier POS.
4. Open **http://localhost:5173/kitchen/login** to test real-time Kitchen board.
