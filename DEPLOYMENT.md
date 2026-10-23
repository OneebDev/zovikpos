# Deployment Notes & Production Architecture

## 1. Database Layer: Heroku Postgres

The primary application database is hosted on **Heroku Postgres**. Supabase is retained **only** for Object Storage of menu item images. Learned aliases are currently stored on local disk and are planned to move to Postgres. Optionally keep the old Supabase database for at least **1 week** as a rollback reference.

### Provisioning (Deploy Day)
Provision Heroku Postgres for the backend application:
```sh
heroku addons:create heroku-postgresql:essential-0 -a <backend-app>
```
> **Note on Plans & Pricing**: Heroku documents the entry-level plan as `essential-0` (verify plan name and current pricing in the [Heroku Postgres documentation](https://devcenter.heroku.com/articles/heroku-postgresql)).

### Connection Limit & Pool Sizing
- **Essential-0 Connection Ceiling**: 20 maximum concurrent database connections.
- **Reserved Connections**: 3 connections reserved for admin tasks, CLI `psql` diagnostics, migration runs, and backup captures.
- **Usable Pool for Application**: 17 total connections maximum across all dynos.
- **Pool Sizing Formula**:
  $$\text{connection\_limit} = \left\lfloor \frac{\text{Total Available (17)}}{\text{WEB\_CONCURRENCY (Dyno Count)}} \right\rfloor$$
- **Configured Parameter Values**:
  - `connection_limit=10`: Sized comfortably below the 20-connection ceiling to leave headroom and avoid connection rejection errors.
  - `pool_timeout=15`: 15-second acquire timeout in Prisma to absorb transient query spikes without failing requests immediately.
  - `sslmode=no-verify`: Heroku Postgres uses self-signed TLS certificates; this setting prevents connection rejections during Node.js SSL handshakes.

### Production `DATABASE_URL` Format
Heroku automatically populates `DATABASE_URL`. Ensure required pooling and TLS parameters are appended:
```sh
postgresql://<user>:<password>@<host>:5432/<database>?connection_limit=10&pool_timeout=15&sslmode=no-verify
```

---

## 2. Release Phase Migrations (`backend/Procfile`)

Migrations execute automatically in Heroku's isolated release phase prior to web dyno restart:

```
release: npx prisma migrate deploy
web: node src/server.js
```

- When code is pushed via `git subtree push --prefix backend heroku-backend main`, Heroku boots a temporary release dyno and runs `npx prisma migrate deploy`.
- If a migration fails, deployment halts and existing web dynos remain unharmed.

---

## 3. Fresh Database Setup

1. Provision Heroku Postgres for the backend application.
2. Set the Heroku-provided `DATABASE_URL` and required backend configuration.
3. Run `npx prisma migrate deploy` during the Heroku release phase.
4. Run the project seed against the fresh database.
5. Verify the seeded menu and required application tables before opening traffic.

No Supabase database data dump or restore is part of this fresh-database plan. Optionally keep the old Supabase database active for at least **1 week** as a rollback reference.

Supabase Storage remains active permanently for menu item images only. Learned aliases currently remain on local disk and are planned to move to Postgres.

---

## 4. Backups, Monitoring & Drains

### Scheduled Nightly Backups
```powershell
heroku pg:backups:schedule DATABASE_URL --at "03:00 Asia/Karachi" -a <backend-app>
heroku pg:backups:capture -a <backend-app>
heroku pg:backups:info -a <backend-app>
```

### Log Drains (BetterStack / Syslog)
```powershell
heroku drains:add <BETTERSTACK_DRAIN_URL> -a <backend-app>
heroku logs --tail -a <backend-app>
```

---

## 5. Redis for Backend Rate Limiting

The backend uses `REDIS_URL` for shared rate-limit counters. The AI service does not need Redis.
- Plan: `heroku-redis:mini`
- > **Note on Plans & Pricing**: Verify plan name and current pricing in the [Heroku Key-Value Store documentation](https://devcenter.heroku.com/articles/heroku-redis).
- Provision:
  ```powershell
  heroku addons:create heroku-redis:mini -a <backend-app>
  ```
- Local fallback: leaving `REDIS_URL` empty defaults safely to in-memory rate limiting.
