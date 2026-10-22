# PrintPoint

**Upload. Pay. Collect in minutes.** PrintPoint is a mobile-first web app for local xerox and print shops in India. Customers upload documents, choose print options, see the exact price, pay with Razorpay, and pick up from the shop or get local delivery. Shop owners manage orders and prices from a dashboard. Admins approve shops and keep an eye on payments, refunds and fraud.

---

## Features

**Customers**
- Sign in with mobile OTP (mocked in development) or email/mobile + password
- Shop discovery with filters: area, open now, delivery, colour, binding, rating
- Shop profile: services, full price list, timings, contact, map link, reviews
- Upload PDF / DOCX / JPG / PNG (25 MB each, multiple files), page count for PDFs, preview
- Print options per file: B/W or colour, A4/A3/Legal, single/double side, paper quality, copies, page range (`1-10, 15, 20-end`), orientation, fit/actual size, binding, lamination, special instructions
- Live price estimate from the server, coupons, save as draft
- Checkout with store pickup or local delivery (saved addresses)
- Razorpay Standard Checkout, verified on the server
- Order tracking timeline, 6-digit pickup OTP, WhatsApp "notify shop" link, PDF invoice, reorder, reviews
- Account: orders, drafts, addresses, saved files, refunds ("wallet"), profile, help

**Shop owners**
- Shop onboarding (bank/UPI stored only as masked references)
- Several price lists, one active; bulk % updates; live customer-price preview
- Orders with 20-second polling plus sound/browser alerts for new paid orders
- Download customer files (only for paid orders at their shop), printable job sheet
- Status flow: Printing → Ready (pickup, OTP-verified) / Out for delivery → Completed; cancel with automatic refund
- Sales: today's stats, 7/30-day revenue chart, top services, average order value, CSV export

**Admins**
- Approve / reject / suspend shops; enable / disable users
- All orders, payments, refunds; issue refunds
- Platform commission %
- Fraud signals: 3+ failed payments in 7 days, unusually large orders, several accounts sharing a delivery phone
- Platform analytics, audit log of admin actions

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS 3 (custom component kit), TanStack Query 5, React Router 6, Recharts, Zod |
| Backend | Node.js, Express 4, TypeScript, Zod, Multer 2, pino logging, helmet, express-rate-limit |
| Database | PostgreSQL + Prisma 5 (SQL migrations included) |
| Auth | JWT access tokens (15 min, in memory) + rotating refresh tokens in an HTTP-only cookie; bcrypt hashing |
| Payments | Razorpay Standard Checkout + webhooks |
| PDFs | pdf-lib (page counts), PDFKit (invoices) |
| Tests | Vitest + Supertest |
| Deploy | Dockerfile + Docker Compose (app + PostgreSQL) |

**Substitutions made**
- `bcryptjs` instead of `bcrypt`: same algorithm and hash format, no native build step (the native package often fails to install on Windows).
- A small custom Tailwind component kit (`client/src/components/ui.tsx`) instead of the shadcn/ui CLI: same look and accessibility goals, no generator step.

## Folder structure

```
.
├── docker-compose.yml        # PostgreSQL + app
├── Dockerfile                # multi-stage production image
├── package.json              # npm workspaces: server, client
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     # all models, enums, indexes
│   │   ├── migrations/       # SQL migrations (init + CHECK constraints)
│   │   └── seed.ts           # demo data
│   ├── src/
│   │   ├── config/env.ts     # validated environment variables
│   │   ├── lib/              # prisma, logger, errors, tokens, page ranges, money
│   │   ├── middleware/       # auth/RBAC, rate limits, error handler
│   │   ├── services/         # pricing engine, orders, payments, Razorpay, storage, notify, invoice
│   │   ├── routes/           # auth, shops, uploads, orders, payments, shop (owner), admin, me
│   │   ├── jobs/             # file retention + payment timeout jobs
│   │   ├── app.ts            # Express app
│   │   └── index.ts          # server entry
│   ├── tests/                # Vitest + Supertest
│   └── uploads/              # local file storage (dev)
└── client/
    └── src/
        ├── lib/              # API client, auth, cart, Razorpay checkout, formatting, types
        ├── components/       # UI kit, layout, shop card, price breakdown, timeline
        └── pages/            # customer, shop/, admin/, account/, info/
```

## Local setup

Prerequisites: Node.js 20+ and either Docker (for PostgreSQL) or a local PostgreSQL 14+.

```bash
# 1. Install dependencies (npm 11 may ask you to approve Prisma/esbuild install scripts; they are pre-approved in package.json)
npm install

# 2. Configure the server
cp server/.env.example server/.env      # then edit secrets and Razorpay keys

# 3. Start PostgreSQL (or point DATABASE_URL at your own)
npm run db:up                           # docker compose up -d db

# 4. Create tables and load demo data
npm run db:deploy                       # applies prisma/migrations
npm run db:seed

# 5. Run API (http://localhost:4000) + web app (http://localhost:5173)
npm run dev
```

Other scripts: `npm test` (API tests), `npm run typecheck`, `npm run build`, `npm start` (serves API + built frontend on port 4000). Use `npm run db:migrate` when you change `schema.prisma` during development.

## Environment variables (`server/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default 4000) |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:5173` |
| `APP_URL` | Public URL of the web app |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Random strings, at least 32 characters each. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` | Token lifetimes (default `15m`, `30`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API keys (use **test** keys in development) |
| `RAZORPAY_WEBHOOK_SECRET` | Secret you set on the Razorpay webhook |
| `STORAGE_DRIVER`, `UPLOAD_DIR` | `local` and the folder for uploads |
| `MAX_FILE_SIZE_MB` | Upload limit per file (default 25) |
| `FILE_RETENTION_HOURS` | Delete files this long after an order completes or is cancelled (default 24) |
| `ORPHAN_FILE_RETENTION_HOURS` | Delete uploads never used in a paid order (default 72) |
| `SMS_PROVIDER`, `DEV_OTP` | `console` logs OTPs; outside production `DEV_OTP` (default `123456`) is the OTP |
| `DEFAULT_COMMISSION_PERCENT` | Used until an admin sets one |

Client (`client/.env`, optional): `VITE_API_URL` only if the API is on a different origin. In development Vite proxies `/api` to port 4000.

## Razorpay test setup

Test mode uses mock payment pages and never moves real money.

1. Create a free account at <https://dashboard.razorpay.com/signup>. You do not need KYC to use test mode.
2. Make sure the dashboard toggle (top bar) is set to **Test Mode**.
3. Go to **Account & Settings → API Keys → Generate Test Key**. Copy the Key ID (`rzp_test_…`) and Key Secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. The secret is shown once and must never go to the frontend; PrintPoint only sends the Key ID to the browser.
4. Webhooks (optional locally, recommended): **Account & Settings → Webhooks → Add New Webhook**
   - URL: `https://<your-public-host>/api/v1/payments/webhook`. For local testing, expose port 4000 with a tunnel such as `ngrok http 4000` or `cloudflared tunnel --url http://localhost:4000`.
   - Secret: any strong string; put the same value in `RAZORPAY_WEBHOOK_SECRET`.
   - Events: `payment.captured`, `payment.failed`, `refund.processed`.
5. Restart the API, place an order and pay with Razorpay's test methods, for example UPI ID `success@razorpay` (or `failure@razorpay` to test failures), or a test card from <https://razorpay.com/docs/payments/payments/test-card-details/>.

**How the payment flow works**
1. `POST /orders` creates the order with a price snapshot (status `PENDING_PAYMENT`).
2. `POST /payments/create-order` creates a Razorpay order on the server and returns `order_id`, `key_id`, amount and `INR`.
3. The browser opens Razorpay Checkout with those values and the customer's name, mobile and email.
4. `POST /payments/verify` checks `HMAC_SHA256(order_id|payment_id, key_secret)` against `razorpay_signature` and confirms amount and status with Razorpay. Only then is the order marked **Paid**, given an order number like `PP-2026-000123`, and (for pickup) a 6-digit OTP.
5. The webhook does the same if the browser closes before verify. Webhook signatures are checked over the raw body, and event IDs are stored so retries are ignored.
6. Failed or cancelled checkouts are recorded as `FAILED`. Unused Razorpay orders time out after 30 minutes; unpaid orders are cancelled after 24 hours. Money captured for an order that was already cancelled is refunded automatically.
7. Refunds (customer cancels before printing, shop cancels, or admin refund) go through the Razorpay refunds API; `refund.processed` finalises them.

Without Razorpay keys the app still runs, but checkout returns "Online payments are not configured". The app never marks an order paid without a verified signature.

## Seed logins

All seed accounts use the password **`Password@123`**. In development the mobile OTP is **`123456`**.

| Role | Email | Mobile |
|---|---|---|
| Admin | admin@printpoint.test | 9000000001 |
| Shop owner (Sri Murugan Xerox, Velachery Print Hub) | owner1@printpoint.test | 9000000002 |
| Shop owner (Anna Nagar Copy Centre) | owner2@printpoint.test | 9000000003 |
| Customer | customer@printpoint.test | 9876543210 |

Seed data also includes 3 approved shops in Chennai (T. Nagar, Velachery, Anna Nagar) with pricing, a saved address, a completed order with a review, and coupon `STUDENT10` (10% off orders over ₹50, up to ₹50).

Change these passwords before using the database anywhere public.

## API summary (`/api/v1`)

All bodies are JSON and validated with Zod. Errors look like `{ "error": { "code", "message", "details?" } }`. Authenticated routes need `Authorization: Bearer <accessToken>`. Money is always in **paise**.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh` (cookie), `POST /auth/logout`, `GET /auth/me` |
| Shops (public) | `GET /shops?city&area&q&openNow&delivery&color&binding&minRating`, `GET /shops/areas`, `GET /shops/:idOrSlug` |
| Uploads | `POST /uploads` (multipart `files[]`), `GET /uploads`, `GET /uploads/:id/download`, `DELETE /uploads/:id` |
| Orders | `POST /orders/quote`, `POST /orders`, `PUT /orders/:id` (draft/unpaid), `GET /orders?status=ACTIVE\|PAST\|DRAFT`, `GET /orders/:id`, `POST /orders/:id/cancel`, `GET /orders/:id/invoice`, `POST /orders/:id/reorder`, `POST /orders/:id/review` |
| Payments | `POST /payments/create-order`, `POST /payments/verify`, `POST /payments/failed`, `POST /payments/webhook` |
| Customer | `GET/POST/PUT/DELETE /me/addresses`, `PUT /me/profile`, `GET /me/refunds` |
| Shop owner | `POST /shop/register`, `GET /shop/shops`, `GET /shop/dashboard`, `GET/PUT /shop/profile`, `GET/POST /shop/pricing`, `PUT/DELETE /shop/pricing/:id`, `POST /shop/pricing/:id/activate`, `POST /shop/pricing/:id/bulk`, `POST /shop/pricing/preview`, `GET /shop/orders`, `GET /shop/orders/:id`, `PATCH /shop/orders/:id/status`, `POST /shop/orders/:id/refund`, `GET /shop/orders/export`, `GET /shop/analytics?days=7\|30`, `GET /shop/notifications` |
| Admin | `GET /admin/shops`, `PATCH /admin/shops/:id/approve\|reject\|suspend`, `GET /admin/users`, `PATCH /admin/users/:id/active`, `GET /admin/orders`, `GET /admin/payments`, `GET/POST /admin/refunds`, `GET /admin/settings`, `PUT /admin/settings/commission`, `GET /admin/fraud`, `GET /admin/analytics`, `GET /admin/audit-logs` |

Shop-owner routes act on the owner's first shop, or on `?shopId=` for owners with several shops.

**Pricing formula** (per file):
`print = printed pages × copies × per-page rate × size multiplier`;
add paper upgrade (per sheet), binding (per copy) and lamination (per sheet).
`total = subtotal + delivery fee + tax − discount`. Orders below the shop's minimum cannot be placed.

## Security notes

- bcrypt password hashing; refresh tokens stored only as HMAC hashes, rotated on every use, and reuse revokes all sessions
- Role-based access (`CUSTOMER`, `SHOP_OWNER`, `ADMIN`) on every protected route; object-level checks on every order and file
- Uploads: type checked by magic bytes, size-limited, saved under random UUID names, path-traversal-safe storage, served only through authorised download endpoints with `no-store`
- Customer files are deleted automatically after the retention period
- Rate limits on login, OTP, upload, payment and general API traffic
- Helmet security headers with a CSP that allows only Razorpay checkout; CORS allow-list
- Razorpay secret never leaves the server; card details are never stored
- Audit log for admin actions; CSV export protected against formula injection
- Pickup OTPs are shown only to the customer, never to the shop

## Deployment

**Docker Compose (single host)**
```bash
cp server/.env.example server/.env    # set strong JWT secrets + Razorpay keys
APP_URL=https://print.example.com docker compose up -d --build
docker compose exec app npx tsx prisma/seed.ts   # optional demo data (needs dev deps; or run the seed from your machine against the DB)
```
The app container applies migrations on start and serves both the API and the built frontend on port 4000. Put it behind HTTPS (Nginx, Caddy or a cloud load balancer): refresh cookies are `Secure` in production.

**Elsewhere** (Render, Railway, a VPS, etc.): provision PostgreSQL, set the environment variables above with `NODE_ENV=production`, then run `npm ci && npm run build && npm run db:deploy && npm start`.

Before going live:
- Switch Razorpay to live keys and create a live-mode webhook
- Plug in a real SMS provider (implement `SmsProvider` in `server/src/services/notify.ts`); production OTPs are random and never returned by the API
- Move uploads to S3/Cloudinary by implementing `StorageDriver` in `server/src/services/storage.ts`, or mount a persistent volume
- Replace the placeholder legal text in `client/src/pages/info/InfoPage.tsx` with reviewed copy

## Extending

- **Coupons**: the `Coupon` model and pricing engine already support shop-level and platform coupons; add an admin UI to manage them.
- **Delivery partners**: `Delivery` stores partner name/phone and status; add a partner role and assignment flow.
- **WhatsApp/SMS APIs**: notifications are recorded in `Notification` with a channel, so an API sender can process pending rows.
- **Mobile app**: the REST API is versioned (`/api/v1`) and token-based, so a React Native or Flutter client can reuse it.
