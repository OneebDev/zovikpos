# Transactional email previews

The baseline is in `before/`; the redesigned templates are in `after/`. Both folders contain one `.html` and one `.txt` per email. The `after/` folder also contains 24 screenshots, one for each email at 600px and 375px in light and simulated dark mode.

| Email | Trigger | Before HTML | After HTML | After screenshot set |
| --- | --- | --- | --- | --- |
| OTP verification | Customer requests an email verification code | `before/otp-verification.html` | `after/otp-verification.html` | `after/otp-verification-{600,375}-{light,dark}.png` |
| Order confirmed | Customer order is placed | `before/order-confirmed.html` | `after/order-confirmed.html` | `after/order-confirmed-{600,375}-{light,dark}.png` |
| Payment confirmed | Payment is verified or cash payment is received | `before/payment-confirmed.html` | `after/payment-confirmed.html` | `after/payment-confirmed-{600,375}-{light,dark}.png` |
| Order ready | Order status changes to READY | `before/order-ready.html` | `after/order-ready.html` | `after/order-ready-{600,375}-{light,dark}.png` |
| Order completed | Order status changes to COMPLETED | `before/order-completed.html` | `after/order-completed.html` | `after/order-completed-{600,375}-{light,dark}.png` |
| Order cancelled / payment failed | Order is cancelled or payment is rejected | `before/order-cancelled.html` | `after/order-cancelled.html` | `after/order-cancelled-{600,375}-{light,dark}.png` |

Run `npm run email:preview` from `backend/` to regenerate after previews without contacting Resend or SMTP. Run `npm run email:check` to verify required files, links, HTML size, escaping, and legacy table-label fallback.
