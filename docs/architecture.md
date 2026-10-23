# Architecture and setup

## Application layout

| Directory | Responsibility |
|---|---|
| `frontend/` | React 19 + Vite single-page web app; role workspaces, route handling, API client, Socket.IO client |
| `backend/` | Express API, controllers, middleware, Prisma schema/client, uploaded menu images |
| `ai-service/` | FastAPI service for demand forecast and ETA prediction |
| `Menu Images/` | Repository-provided menu image assets |

## Request flow

The browser calls the Express API through `frontend/src/services/api.js`. The default API URL uses the browser hostname on port 5001; `VITE_API_BASE_URL` can override it. The server mounts feature routers under `/api`, exposes `/health`, serves `/uploads`, and initializes Socket.IO on the same HTTP server. Database access is through Prisma (`backend/src/config/db.js`).

The browser Socket.IO client connects to port 5001 and joins with the current role and user ID. Backend socket handlers determine the room/event behavior. The separate AI service defaults to port 8000 and is configured through `AI_SERVICE_URL` where used.

## Local development

Install Node dependencies in `backend/` and `frontend/`; install Python dependencies from `ai-service/requirements.txt`. Generate the Prisma client before starting the API. Run the backend, Vite frontend, and Python service as separate processes when exercising features that depend on all three.

Configuration belongs in environment files, especially `backend/.env`; required values depend on which optional integrations are enabled. Typical configuration areas include Heroku Postgres database URL, JWT secrets, frontend origin, AI service URL, QR signing secret, Supabase Storage, SMTP, and Groq. Do not copy secrets from the root README into source control or documentation.

## Technology

- Frontend: React 19, React Router, Axios, TanStack Query, Socket.IO client, Recharts, Lucide, Vite.
- Backend: Node.js, Express, Prisma, Heroku Postgres, Socket.IO, JWT, bcrypt, Supabase Storage client, Nodemailer, PayFast SDK/API, XLSX, Tesseract.js, PDF parsing, QR generation.
- AI service: Python 3.12, FastAPI, NumPy, pandas, scikit-learn (with fallbacks).

## Runtime caveats

The root README describes a Heroku Postgres deployment with Supabase Storage only; actual runtime behavior depends on `DATABASE_URL` and environment configuration. The Python ETA model trains on generated synthetic samples at service startup; it is not a persisted model loaded from the included pickle by the code shown in `main.py`. The demand forecast module also generates synthetic history and can overwrite recent values with actual history supplied by its caller.
