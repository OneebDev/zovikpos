# Authentication, roles, and safeguards

## Roles and access layers

The application uses `ADMIN`, `VENDOR`, `KITCHEN`, and `CUSTOMER` roles. Frontend route guards improve navigation but do not replace server authorization. Backend routers apply JWT authentication and role middleware to protected operations. Public routes include menu reads, selected table/QR reads, payment settings, and token-based order tracking.

## Login and token lifecycle

Authentication endpoints include registration, login, refresh-token, profile, logout, and email OTP send/verify. The frontend API client attaches a bearer access token and refreshes after eligible 401 responses, queueing simultaneous failed requests. Tokens/user state are saved in browser storage with role-specific keys as well as shared keys. Logout clears role/customer operational state and reconnects the socket as a guest.

## Account/session handling

The schema supports active/deactivated users and session lifecycle/expiry. Customer table session secrets are securely hashed using SHA-256 digests and compared with `crypto.timingSafeEqual` to eliminate timing attack vectors and plaintext session token exposures. Middleware includes session activity, rate limiting, role authorization, audit recording, and demo guards. Database transactions that handle high concurrency utilize deadlock retries (`withDeadlockRetry`) with exponential jitter backoff. Admin can change staff roles and statuses. The client listens for role/status changes and session-expiry events to show a modal or log out.

## Demo mode

Demo status is represented by `User.isDemo`. `demoGuardMiddleware` is present in the backend, and the client has a demo restriction modal/status badge plus export restrictions in `frontend/src/utils/exportUtils.js`. Exact middleware coverage depends on where the guard is mounted; do not assume every write route is protected just because the middleware exists. Verify route mounting before exposing a demo account.

## Audit and rate limits

Audit middleware and `AuditLog` capture action/entity, actor, values, IP, and timestamp where applied. Admin can query and delete audit records. Authentication and OTP routes use dedicated limiters; a general limiter is applied to `/api`.

## Operational security

Keep JWT, QR signing, Hostinger SMTP, PayFast secured key, database, Supabase Storage, and Groq API provider secrets in local environment configuration. Never publish real credentials in Markdown. Any credential committed to the repository should be treated as exposed and rotated. Use HTTPS and secure deployment configuration outside local development.
