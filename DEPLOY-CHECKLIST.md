# Deployment Checklist & Architecture Service Map

## 1. Architecture Service Map & Database Roles

| Service / Role | Platform | Purpose | Database / Connection Details |
| :--- | :--- | :--- | :--- |
| **Local Development DB** | Localhost (Port 5432) | Offline development, testing, schema experimentation | Local PostgreSQL (`zovikpos_dev`). Set in `backend/.env`. |
| **Production Application DB** | Heroku Postgres (Essential-0 / Standard) | Production transactional database (DML / Runtime & DDL / Migrations) | Main PostgreSQL instance attached via `DATABASE_URL`. Connection pooling: `connection_limit=10&pool_timeout=15&sslmode=no-verify`. |
| **Storage Only** | Supabase Storage | Image assets storage (Menu Images bucket) | **NOT used as database**. Access via `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Supabase DB/Auth are removed. |
| **AI / ML Service** | FastAPI (Local / Cloud) | Vision, ETA predictions, Demand forecasting | Communicates via HTTP API (`AI_SERVICE_URL`). |
| **Frontend Web App** | Vercel | Customer & Admin dashboard UI | Static / Next.js / Vite build communicating with Backend REST API. |

---

## 2. Environment Variables Roster by Service

### A. Heroku Backend Dyno (`zovik-pos-backend`)
- `PORT` (assigned dynamically by Heroku)
- `NODE_ENV=production`
- `DATABASE_URL` (Heroku Postgres connection string with query params: `connection_limit=10&pool_timeout=15&sslmode=no-verify`)
- `JWT_SECRET` (unique cryptographic random string)
- `JWT_REFRESH_SECRET` (unique cryptographic random string)
- `QR_SECRET` (unique cryptographic random string)
- `FRONTEND_URL` (`https://<your-app>.vercel.app`)
- `CORS_ORIGINS` (`https://<your-app>.vercel.app`)
- `AI_SERVICE_URL` (`https://<your-ai-service>.herokuapp.com` or equivalent)
- `SUPABASE_URL` (Supabase project URL for Storage bucket access)
- `SUPABASE_ANON_KEY` (Supabase public/anon API key for Storage bucket access)
- `SMTP_HOST` (`smtp.hostinger.com`)
- `SMTP_PORT` (`465`)
- `SMTP_SECURE` (`true`)
- `SMTP_USER` (`support@zovikpos.store`)
- `SMTP_PASS` (Hostinger mailbox password)
- `EMAIL_FROM` (`Zovik POS <support@zovikpos.store>`)
- `GROQ_API_KEY` (Groq API key for vision / LLM)
- `GROQ_MODEL` (`qwen/qwen3.8-27b`)
- `REDIS_URL` (Optional / Heroku Data for Redis URL if configured)
- `SWEEP_ENABLED` (`true`)
- `SESSION_IDLE_MINUTES` (`10`)

### B. AI / ML Service (FastAPI)
- `PORT` (assigned by host or default 8000)
- `DATABASE_URL` (if direct read-only DB access needed, else communicates with Backend API)
- `GROQ_API_KEY`

### C. Vercel Frontend
- `VITE_API_URL` / `NEXT_PUBLIC_API_URL` (Pointing to Heroku backend URL, e.g. `https://<backend-app>.herokuapp.com/api`)
- `VITE_SOCKET_URL` (Pointing to Heroku backend URL for Socket.IO)

---

## 3. Seed & Migration Critical Warnings

> [!WARNING]
> **NEVER RUN `prisma db seed` OR TRUNCATING SCRIPTS ON HEROKU PRODUCTION DATABASE.**
> - `npx prisma db seed` / `clear_menu.js` will wipe existing orders, sessions, and live transactions.
> - On Heroku release phase, ONLY run schema migrations:
>   ```bash
>   npx prisma migrate deploy
>   ```
> - Seed data should only be applied to local dev database (`zovikpos_dev`) or during initial environment provisioning via dedicated idempotent migration scripts.

---

## 4. Mail & Infrastructure Pre-flight

- Hostinger email plan trial expiry: **2026-11-22**. Renew it before deploy/viva.
- Verify SPF, DKIM, and DMARC in the Hostinger panel.
- Ensure Heroku dyno has release phase configured in `Procfile`:
  ```procfile
  web: node src/server.js
  release: npx prisma migrate deploy
  ```
