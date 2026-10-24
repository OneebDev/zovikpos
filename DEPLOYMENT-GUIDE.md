# 🚀 Production Deployment Guide — ZOVIK POS

Comprehensive deployment instructions for **Frontend**, **Backend**, and **AI Service** on Cloud Hosting (Vercel, Heroku, Render, AWS).

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    Client[Mobile PWA / Web Client] -->|HTTPS / WSS| Backend[Heroku Backend API]
    Backend -->|PostgreSQL Wire| DB[(PostgreSQL Database)]
    Backend -->|Internal REST| AIService[Heroku AI Microservice]
    Backend -->|SMTP Port 465| MailServer[Hostinger Mail Server]
    Backend -->|Sandbox / Live| PayFast[PayFast Gateway]
    Client -->|Static Bundle| Vercel[Vercel / Cloudflare Frontend]
```

---

## 1️⃣ Deploying the Frontend (Vercel / Netlify / Cloudflare Pages)

### Option A: Vercel (Recommended for Vite/React)

1. **Connect GitHub Repo** on [Vercel Dashboard](https://vercel.com).
2. Configure Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Set Production Environment Variables in Vercel:
   ```env
   VITE_API_URL=https://zovik-pos-backend-dda1e83c23d5.herokuapp.com/api
   VITE_SOCKET_URL=https://zovik-pos-backend-dda1e83c23d5.herokuapp.com
   ```
4. Click **Deploy**.

> 💡 **SPA Rewrites**: Ensure `frontend/vercel.json` contains rewrites so React Router handles routing without 404s:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 2️⃣ Deploying Backend to Heroku (`zovik-pos-backend`)

The backend is structured inside the `backend/` directory of the monorepo. It is deployed using Git Subtree.

### Step 1: Set Heroku Buildpack & Stack
```powershell
heroku stack:set heroku-24 --app zovik-pos-backend
heroku buildpacks:clear --app zovik-pos-backend
heroku buildpacks:set heroku/nodejs --app zovik-pos-backend
```

### Step 2: Configure Environment Variables on Heroku
```powershell
heroku config:set NODE_ENV=production --app zovik-pos-backend
heroku config:set DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" --app zovik-pos-backend
heroku config:set JWT_SECRET="your-production-jwt-secret-key" --app zovik-pos-backend
heroku config:set CLIENT_URL="https://your-frontend-domain.vercel.app" --app zovik-pos-backend
heroku config:set SMTP_HOST="smtp.hostinger.com" --app zovik-pos-backend
heroku config:set SMTP_PORT=465 --app zovik-pos-backend
heroku config:set SMTP_SECURE=true --app zovik-pos-backend
heroku config:set SMTP_USER="support@zovikpos.store" --app zovik-pos-backend
heroku config:set SMTP_PASS="YourSecurePassword" --app zovik-pos-backend
heroku config:set SMTP_FROM="ZOVIK POS Support <support@zovikpos.store>" --app zovik-pos-backend
heroku config:set EMAIL_FROM="support@zovikpos.store" --app zovik-pos-backend
heroku config:set AI_SERVICE_URL="https://zovik-pos-ai.herokuapp.com" --app zovik-pos-backend
heroku config:set PAYFAST_MERCHANT_ID="10000100" --app zovik-pos-backend
heroku config:set PAYFAST_SECURE_KEY="46f0cd694581a" --app zovik-pos-backend
heroku config:set PAYFAST_SANDBOX="true" --app zovik-pos-backend
```

### Step 3: Push Backend via Subtree Split
Run from the root directory:
```powershell
cd d:\FYP\AI-Powered-POS-main

$h = git subtree split --prefix=backend HEAD
git push heroku-backend "${h}:refs/heads/main" --force
```

> ✅ Prisma migrations run automatically via `Procfile` (`release: npx prisma migrate deploy`).

---

## 3️⃣ Deploying AI Microservice to Heroku (`zovik-pos-ai`)

The AI OCR service is a Python FastAPI microservice located in `ai-service/`.

### Step 1: Set Heroku Python Buildpack
```powershell
heroku buildpacks:clear --app zovik-pos-ai
heroku buildpacks:set heroku/python --app zovik-pos-ai
```

### Step 2: Configure Environment Variables on Heroku
```powershell
heroku config:set PORT=5000 --app zovik-pos-ai
heroku config:set GROQ_API_KEY="gsk_your_groq_vision_key" --app zovik-pos-ai
```

### Step 3: Push AI Microservice via Subtree Split
```powershell
cd d:\FYP\AI-Powered-POS-main

$h = git subtree split --prefix=ai-service HEAD
git push heroku-ai "${h}:refs/heads/main" --force
```

---

## 4️⃣ One-Click All-in-One Deployment Script

To push everything in one go:
```powershell
cd d:\FYP\AI-Powered-POS-main

# 1. Backup all code to GitHub
git add -A
git commit -m "feat: your update message"
git push oneebdev main

# 2. Deploy Backend
$b = git subtree split --prefix=backend HEAD
git push heroku-backend "${b}:refs/heads/main" --force

# 3. Deploy AI Service
$ai = git subtree split --prefix=ai-service HEAD
git push heroku-ai "${ai}:refs/heads/main" --force
```

---

## 5️⃣ Health Check Endpoints

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| Backend API | `GET https://zovik-pos-backend-dda1e83c23d5.herokuapp.com/health` | `{"status":"ok","timestamp":"..."}` |
| AI Service | `GET https://zovik-pos-ai.herokuapp.com/health` | `{"status":"online","service":"ai-vision"}` |
| Frontend | `GET https://your-frontend.vercel.app` | `200 OK` (PWA Loaded) |
