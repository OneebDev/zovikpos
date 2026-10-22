# Production logs on Heroku

The backend and AI service continue to write redacted JSON log lines to stdout. In production (`NODE_ENV=production`), they do not create or write dated log files; Heroku dyno files are temporary. Local development keeps the dated text files alongside stdout.

## Send logs to Better Stack or Papertrail

1. Create an account with Better Stack or Papertrail and create a source for Heroku logs. Select the Heroku drain/syslog source type and copy the complete drain URL supplied by the provider. Keep that URL private; it can contain an ingestion token.
2. Add the drain to each Heroku app that runs the backend or AI service. Replace the placeholders with the provider URL and your app name:

   ```sh
   heroku drains:add <url> -a <app>
   ```

   Repeat for the second app if the backend and AI service are deployed separately. Do not commit the URL or paste it into source files.
3. Open the source's live log search. Search for `SOURCE=http.response.`, `SOURCE=db.query`, `SOURCE=email.smtp.send`, `SOURCE=socket`, or `SOURCE=redis.`. Provider search syntax differs; use the `SOURCE=...` text as the search term if field search is unavailable.
4. Verify delivery without adding a test route or changing data: request a path that does not exist on the deployed backend:

   ```sh
   curl -i https://<backend-host>/api/__log_drain_verify__
   ```

   The response should be 404. Search the drain for `SOURCE=http.response.404` and the unique path `__log_drain_verify__`. Seeing that entry confirms that the app log reached the drain.

## Heroku router timeouts and alerts

Heroku router records, including H12 (request timeout) and H13 (connection closed without a response), are delivered through the same app log drain. Search the drain for `source:router` and `H12` or `H13`; if the provider does not expose a `source` field, search the text `heroku[router]` and the code. Group by app and dyno, then inspect the request path and status.

Suggested initial alert rules (tune them to normal traffic and quiet hours):

- **5xx rate:** alert when HTTP 5xx responses exceed 2% of requests for 5 minutes, with a minimum of 20 requests in that window.
- **H12/H13:** alert on any H12 or H13 in 5 minutes; page only when repeated (for example, 3 or more in 5 minutes).
- **R14 memory:** alert on any `R14` memory quota event; alert again if it repeats within 15 minutes.
- **Socket disconnect spike:** alert when `SOURCE=socket.disconnect` exceeds 3× its same-hour baseline for 5 minutes, with a floor such as 30 disconnects. Ordinary client navigation can disconnect sockets, so avoid paging on a single disconnect.
- **SMTP failures:** alert on 5 or more `SOURCE=email.smtp.send` failures in 10 minutes, or any sustained failure for 10 minutes.
- **Database errors:** alert on 5 or more `SOURCE=db.query` errors in 5 minutes, and immediately on a sustained database-unavailable readiness check.

Creating a source and configuring alerts are provider-side actions. This repository does not create a Better Stack/Papertrail account, configure credentials, or provision a paid Heroku add-on.
