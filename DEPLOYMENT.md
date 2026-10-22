# Deployment notes

## Redis for backend rate limiting

The backend uses `REDIS_URL` for shared rate-limit counters. The AI service does not need Redis. The Redis add-on is **not provisioned** by this repository; it is a paid Heroku resource and requires explicit approval before creation.

Heroku's current Key-Value Store Mini plan is `heroku-redis:mini`. Heroku documents it at $0.004/hour, up to $3/month, with 25 MB and a 20-connection limit. Mini has no persistence and no high availability. Confirm the current price and plan details in the [Heroku Key-Value Store docs](https://devcenter.heroku.com/articles/heroku-redis) before provisioning.

After approval at deployment time, provision it for the backend app only:

```sh
heroku addons:create heroku-redis:mini -a <backend-app>
```

Heroku attaches the add-on and populates `REDIS_URL` automatically. Confirm the config var is present without copying its secret value into the repository:

```sh
heroku config:get REDIS_URL -a <backend-app>
```

Do not replace the add-on-managed value manually. If you intentionally use a separately managed Redis provider instead, set that provider's TLS URL as a Heroku config var (never commit or share the URL):

```sh
heroku config:set REDIS_URL='rediss://<user>:<password>@<host>:<port>' -a <backend-app>
```

For local development, put a local Redis URL in the ignored `backend/.env`, for example `REDIS_URL=redis://127.0.0.1:6379`; leaving it unset uses the in-memory rate-limit fallback. Production logs the selected rate-limit mode at startup. `/health` does not depend on Redis; `/ready` checks Redis when `REDIS_URL` is configured.

## Database migrations

Before any production migration, take and verify a database backup, review the exact migration SQL, and get explicit approval. No production migration is run automatically by the application.
