# Deployment Checklist & Architecture Service Map

## 1. Architecture Service Map & Database Roles

| Service / Role | Platform | Purpose | Database / Connection Details |
| :--- | :--- | :--- | :--- |
| **Local Development DB** | Localhost (Port 5432) | Offline development, testing, schema experimentation | Local PostgreSQL (`zovikpos_dev`). Set in `backend/.env`. |
| **Production Application DB** | Heroku Postgres (Essential-0 / Standard) | Production transactional database (DML / Runtime & DDL / Migrations) | Main PostgreSQL instance attached via `DATABASE_URL`. Connection pooling: `connection_limit=5&pool_timeout=15&sslmode=no-verify`. |
| **Storage Only** | Supabase Storage | Image assets storage (`Menu Images` bucket) | **NOT used as database**. Access via `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Supabase DB/Auth are removed. |
| **AI / ML Service** | Heroku Dyno / FastAPI | Vision, OCR, ETA predictions, Demand forecasting | Communicates via HTTP API (`AI_SERVICE_URL`). Procfile & runtime.txt configured. |
| **Frontend Web App** | Vercel | Customer & Admin dashboard UI | React / Vite build communicating with Backend REST API. |

---

## 2. Infrastructure Assumptions & Scaling Limits

### Single Web Dyno Assumption (In-Memory Socket.IO)
- **Current Architecture:** Runs on **1 web dyno**.
- **Socket.IO:** Uses default in-memory adapter (`new Server(...)`). Realtime events (order updates, kitchen notifications, tracking) are broadcast across connected sockets on this single process.
- **Scaling Limit:** If scaled to **2+ web dynos**, an external Pub/Sub adapter (e.g. `@socket.io/redis-adapter` with Heroku Data for Redis) will be required so that dynos can synchronize socket broadcasts.

### Ephemeral Filesystem Limitation
- Heroku dynos possess an ephemeral filesystem. Files written to local disk (e.g., local `/uploads` fallback or cached OCR aliases in `aliasService.js`) are destroyed on dyno restart/cycling (every 24 hours).
- **Production Asset Safety:** All menu images MUST be stored in Supabase Storage. Local `/uploads` is strictly a local dev fallback.

### Database Connection Accounting (Heroku Postgres Essential-0: Max 20 Connections)
- **Web Dyno Pool:** `connection_limit=5` (default via `DB_POOL_MAX=5`).
- **Background Sweep Job:** Runs inside the same web dyno process, utilizing the shared connection pool.
- **Release Phase Migration:** `release: npx prisma migrate deploy` runs in an ephemeral one-off dyno prior to routing traffic, using 1 connection and terminating before web dynos boot.
- **Safety Margin:** 5 active web connections leaves 15 free connections on the 20-connection Essential-0 tier for release scripts, psql access, and spikes.

---

## 3. Environment Variables Roster by Service

### A. Heroku Backend Dyno (`zovik-pos-backend`)
- `PORT` (assigned dynamically by Heroku)
- `NODE_ENV=production`
- `DATABASE_URL` (Heroku Postgres connection string with query params: `connection_limit=5&pool_timeout=15&sslmode=no-verify`)
- `DB_POOL_MAX=5`
- `DB_POOL_TIMEOUT_SECONDS=15`
- `JWT_SECRET` (unique cryptographic random string)
- `JWT_REFRESH_SECRET` (unique cryptographic random string)
- `QR_SECRET` (unique cryptographic random string)
- `FRONTEND_URL` (`https://zovik-pos.vercel.app`)
- `CORS_ORIGINS` (`https://zovik-pos.vercel.app`)
- `AI_SERVICE_URL` (`https://zovik-pos-ai.herokuapp.com`)
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
- `REQUEST_TIMEOUT_MS` (`25000`)

### B. Heroku AI / ML Service (`zovik-pos-ai`)
- `PORT` (assigned dynamically by Heroku)
- `GROQ_API_KEY` (Groq API key for vision analysis)
- `GROQ_MODEL` (`qwen/qwen3.8-27b`)

### C. Vercel Frontend
- `VITE_API_URL` (`https://zovik-pos-backend.herokuapp.com`)
- `VITE_SOCKET_URL` (`https://zovik-pos-backend.herokuapp.com`)

---

## 4. Deploy Order & Execution Steps

1. **Provision Database & AI Services:**
   - Attach Heroku Postgres (Essential-0) to backend app.
   - Deploy `ai-service` to Heroku with Python 3.14 runtime.
2. **Deploy Backend Dyno:**
   - Push to Heroku Git or GitHub integration.
   - Heroku executes `release: npx prisma migrate deploy` applying `20261024000000_baseline`.
   - Web dyno boots with `node src/server.js`.
3. **Deploy Frontend on Vercel:**
   - Configure `VITE_API_URL` and `VITE_SOCKET_URL`.
   - Deploy production build.

---

## 5. Pre-flight Smoke Tests Checklist

- [ ] **Health Endpoint:** `GET /health` returns `200 OK` with status and uptime.
- [ ] **Readiness Probe:** `GET /ready` returns `200 OK` confirming database connection.
- [ ] **Staff / Customer Login:** Verify JWT token issuance and refresh cookie/headers.
- [ ] **OTP Email Delivery:** Trigger verification code and verify delivery from `support@zovikpos.store`.
- [ ] **Table Session & Order Creation:** Scan table QR, add items to cart, and place order.
- [ ] **Realtime Sockets:** Confirm kitchen board receives `order:new` broadcast immediately upon payment verification.
- [ ] **Payment Verification & Deduction:** Verify payment approving updates stock in inventory with atomic deductions.

---

## 6. Seed & Migration Critical Warnings

> [!WARNING]
> **NEVER RUN `prisma db seed`, `clear_menu.js`, OR TRUNCATING SCRIPTS ON HEROKU PRODUCTION DATABASE.**
> - `npx prisma db seed` / `clear_menu.js` will wipe existing orders, sessions, and live transactions.
> - On Heroku release phase, ONLY run schema migrations:
>   ```bash
>   npx prisma migrate deploy
>   ```
> - Initial menu and categories should only be seeded locally or manually curated via admin dashboard.

---

## 7. Mail & DNS Infrastructure Pre-flight

- Hostinger email plan trial expiry: **2026-11-22**. Renew it before deploy/viva.
- Verify SPF, DKIM, and DMARC in the Hostinger panel.
