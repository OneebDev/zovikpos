# 💻 Local Setup Guide — ZOVIK POS

Complete step-by-step guide to run **ZOVIK POS** locally on Windows, macOS, or Linux.

> **Collaborator Note:** Production credentials (Heroku, Vercel, Hostinger SMTP) are managed separately. This guide uses **local/dev credentials** only.

---

## 📋 Prerequisites

Install the following before starting:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | v20 or v22 LTS | https://nodejs.org |
| **Python** | 3.10+ or 3.11+ | https://python.org |
| **PostgreSQL** | v15 or v16 | https://postgresql.org/download |
| **Git** | Latest | https://git-scm.com |

---

## 📁 Project Structure

`
AI-Powered-POS/
├── backend/       # Express.js REST API + Prisma ORM + Socket.io  (Port: 5001)
├── frontend/      # React 18 + Vite                               (Port: 5173)
├── ai-service/    # FastAPI Python OCR + Groq AI                  (Port: 8000)
├── prisma/        # Database schema + migrations + seed files
└── .github/       # CI/CD GitHub Actions workflows
`

---

## 1️⃣ Clone the Repository

`ash
git clone https://github.com/OneebDev/zovikpos.git
cd zovikpos
`

---

## 2️⃣ PostgreSQL Database Setup

### Step 1: Create Database
Open **pgAdmin** or **psql** terminal and run:
`sql
CREATE DATABASE zovikpos_dev;
CREATE USER zovikpos_user WITH PASSWORD 'LocalDev2026x';
GRANT ALL PRIVILEGES ON DATABASE zovikpos_dev TO zovikpos_user;
`

Or simply use the default postgres superuser:
`sql
CREATE DATABASE zovikpos_dev;
`

### Step 2: Note your connection string
`
postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/zovikpos_dev
`
You will need this in the backend .env below.

---

## 3️⃣ Backend Setup (ackend/)

### Step 1: Install dependencies
`ash
cd backend
npm install
`

### Step 2: Create .env file in ackend/
`env
# Database
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/zovikpos_dev"

# Server
PORT=5001
NODE_ENV=development

# JWT
JWT_SECRET="pos_system_jwt_access_secret_key_2026"
JWT_REFRESH_SECRET="pos_system_jwt_refresh_secret_key_2026"

# Frontend URL (use your local IP for QR codes to work on phones on same WiFi)
# Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)
FRONTEND_URL="http://YOUR_LOCAL_IP:5173"

# AI Service
AI_SERVICE_URL="http://localhost:8000"

# QR Token Secret
QR_SECRET="swipebite_pos_qr_cryptographic_secret_2026"

# CORS (add your local IP)
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://YOUR_LOCAL_IP:5173"

# SMTP Email (Gmail for local dev)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=oacreatives951@gmail.com
SMTP_PASS=rubkcopuyiaqderm
EMAIL_FROM="Zovik POS <oacreatives951@gmail.com>"

# Groq AI Keys (get from team)
GROQ_API_KEY="gsk_your_groq_key_here"
GROQ_MODEL="qwen/qwen3.8-27b"

# PayFast Sandbox
PAYFAST_MERCHANT_ID="10000100"
PAYFAST_MERCHANT_KEY="46f0cd694581a"
PAYFAST_PASSPHRASE=""
PAYFAST_SANDBOX_URL="https://sandbox.payfast.co.za/eng/process"
PAYFAST_MODE="sandbox"
`

> **💡 Find your local IP:** Run ipconfig on Windows → look for **IPv4 Address** under your WiFi adapter (e.g., 192.168.1.105).

### Step 3: Run Database Migrations
`ash
cd backend

# Generate Prisma client
npx prisma generate

# Push schema to database (creates all tables)
npx prisma db push
`

### Step 4: Seed Initial Data (Optional but Recommended)
`ash
# Seed admin user + basic setup
node prisma/seed.js

# Seed canteen menu items (optional demo data)
node prisma/seed_canteen_menu.js
`

### Step 5: Start Backend
`ash
npm run dev
`
> ✅ Backend runs on: **http://localhost:5001**

---

## 4️⃣ Frontend Setup (rontend/)

### Step 1: Install dependencies
`ash
cd frontend
npm install
`

### Step 2: Create .env file in rontend/
`env
# Use your local IP (same as FRONTEND_URL in backend .env)
VITE_API_BASE_URL="http://YOUR_LOCAL_IP:5001/api"
VITE_SOCKET_URL="http://YOUR_LOCAL_IP:5001"
`

> If you are only testing on the same machine (not phone/tablet), you can use localhost:
> `env
> VITE_API_BASE_URL="http://localhost:5001/api"
> VITE_SOCKET_URL="http://localhost:5001"
> `

### Step 3: Start Frontend
`ash
npm run dev
`
> ✅ Frontend runs on: **http://localhost:5173**

---

## 5️⃣ AI Service Setup (i-service/)

### Step 1: Create Python virtual environment
`ash
cd ai-service

# Windows
python -m venv venv
.\venv\Scripts\activate

# Mac / Linux
python3 -m venv venv
source venv/bin/activate
`

### Step 2: Install Python dependencies
`ash
pip install -r requirements.txt
`

### Step 3: Create .env file in i-service/
`env
PORT=8000
GROQ_API_KEY="gsk_your_groq_key_here"
`

### Step 4: Start AI Service
`ash
python main.py
`
> ✅ AI Service runs on: **http://localhost:8000**

---

## 6️⃣ Verify Everything is Running

Open these URLs in your browser:

| URL | Description |
|-----|-------------|
| http://localhost:5173/admin/login | Admin Dashboard |
| http://localhost:5173/cashier/login | Cashier POS |
| http://localhost:5173/kitchen/login | Kitchen Display |
| http://localhost:5173/customer | Customer Portal |
| http://localhost:8000/docs | AI Service Swagger Docs |

---

## 7️⃣ QR Codes for Tables (Phone Testing)

For QR codes to open on your phone:
1. Make sure your phone is on the **same WiFi** as your laptop
2. Set FRONTEND_URL in backend .env to your local IP (e.g., http://192.168.1.105:5173)
3. Set VITE_API_BASE_URL in frontend .env to the same IP
4. **Regenerate QR codes** from Admin → Tables → Regenerate QR

The QR code will point to:
`
http://192.168.1.105:5173/customer/table/[token]
`

---

## ⚠️ Common Issues

| Issue | Fix |
|-------|-----|
| ECONNREFUSED 5432 | PostgreSQL not running — start it from Services or pgAdmin |
| prisma db push fails | Check DATABASE_URL credentials in .env |
| QR code not working on phone | Use local IP, not localhost in both .env files |
| Email not sending locally | Gmail App Password — make sure 2FA is ON on the Gmail account |
| Port 5001 in use | Change PORT=5001 to PORT=5002 in backend .env |
