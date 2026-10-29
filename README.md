# PrintPoint

**Print it nearby.** PrintPoint connects customers with local xerox and print shops in India. A customer uploads files in a chat-style assistant, picks a shop and print options, sees the exact price and sends a request. The shop accepts (or declines with a reason), the customer pays, and collects the prints with a 6-digit pickup code. Everything updates live on both sides.

---

## How it works

```
Customer (/)                      Server                          Shop owner (/owner)
upload files ───────────────▶ magic-byte check, store privately
pick shop, B/W, sides, copies,
binding, note ─────────────▶ quote (same engine as the order)
"Send request to shop" ────▶ REQUESTED ──── socket.io ───────────▶ new card + chime
                                         ◀── Accept (ready time) ── ACCEPTED + pickup code
status card: code + ready time ◀────────
Pay (Razorpay) ────────────▶ PAID ───────────────────────────────▶ "Mark printing"
                             PRINTING ──▶ READY ◀──────────────── "Mark ready"
show code at counter ───────────────────────── verify code ──────▶ COMPLETED, files deleted
```

- **Deny**: the owner must give a reason; the customer sees it and is never charged.
- **Cancel**: the customer can cancel while the request is still waiting for the shop.
- **Expiry**: requests the shop never answers, and accepted requests never paid, are cancelled after 24 hours.
- **No Razorpay keys (development)**: the owner can go straight from Accepted to Printing and collect payment at the counter. The app never marks anything as paid without a verified Razorpay signature.

## Features

**Customers (home page `/`)**
- Chat-style assistant: upload (drag-and-drop or picker, several files, PDF / DOCX / JPG / PNG up to 25 MB) → choose shop → B/W or colour → single or double-sided → copies → binding (none / spiral) → optional note
- File list shows name, size and detected page count, with progress, retry and remove; asks for the page count when it can't be detected (some DOCX)
- Sign in with mobile + OTP inside the chat (asked before the first upload)
- Price summary from the server: each line shows the rate used (including the double-sided rate), and lines add up exactly to the total
- Live status card: Waiting for shop → Accepted (pickup code + estimated ready time, Pay button) → Printing → Ready → Collected, or Denied with the shop's reason
- "My requests" tab with active and past requests; returning customers land there when something is in progress
- Side panel (desktop) / collapsible top sheet (phone) for the chosen shop: open/closed, today's hours, requests waiting, printing, estimated wait, price list, all live

**Shop owners (`/owner`)**
- Email/password sign-in on the page itself
- Live list, newest first, with counters: Pending / Accepted / Printing / Ready / Completed today
- Each card: customer name and masked phone (last 4 digits), files with preview/download (short-lived links), options, total, note, time received
- Accept (choose ready time) · Deny (pick or type a reason) · Mark printing · Mark ready · Verify pickup code → Collected
- New requests chime (after "Turn on sound alerts", since browsers block autoplay) and get a highlight
- Open/closed switch, price list editor (`/shop/pricing`), takings and shop details (`/shop`)

**Admins** (`/admin`): approve shops, users, orders, payments, refunds, commission, fraud signals, audit log.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS 3, TanStack Query 5, React Router 6, socket.io-client |
| Backend | Node.js, Express 4, TypeScript, Zod, Multer 2, socket.io 4, pino, helmet, express-rate-limit |
| Database | PostgreSQL + Prisma 5 (SQL migrations included) |
| Auth | JWT access tokens (15 min, in memory) + rotating refresh tokens in an HTTP-only cookie |
| Payments | Razorpay Standard Checkout + webhooks |
| Tests | Vitest + Supertest |

## Project layout

The frontend and backend are two separate projects, each with its own `package.json`, `package-lock.json` and `node_modules`:

| Folder | What | Deployed to |
|---|---|---|
| `frontend/` | React + Vite web app | Vercel (Root Directory `frontend`) |
| `backend/` | Express API, Prisma, `Dockerfile` | Render (Root Directory `backend`, Docker) |
| `docker-compose.yml` | Local PostgreSQL (and optionally the API) | local only |

## Run it locally

Prerequisites: Node.js 20+ and Docker Desktop (for PostgreSQL).

```bash
docker compose up -d db                   # PostgreSQL in Docker

cd backend
npm install
cp .env.example .env                      # set JWT secrets; Razorpay test keys are optional
npm run db:deploy                         # apply migrations
npm run db:seed                           # the PrintPoint shop, its owner, an admin and a customer
npm run dev                               # API on :4000

# in a second terminal
cd frontend
npm install
npm run dev                               # web app on :5173
```

Open <http://localhost:5173>. It's a demo site: there's no sign-in, and the **View as** bar at the bottom switches between Customer, Shop owner and Admin.

Other scripts, run inside `backend/` or `frontend/`: `npm test` (backend), `npm run typecheck`, `npm run build`.

### Seed logins

All seed accounts use the password **`Password@123`**. In development the OTP is **`123456`**.

| Role | Email | Mobile |
|---|---|---|
| Admin | admin@printpoint.test | 9000000001 |
| Shop owner (Sri Murugan Xerox, Velachery Print Hub) | owner1@printpoint.test | 9000000002 |
| Shop owner (Anna Nagar Copy Centre) | owner2@printpoint.test | 9000000003 |
| Customer | customer@printpoint.test | 9876543210 |

An owner with several shops sees their first shop on `/owner`; add `?shopId=<id>` to API calls for the others.

## Environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default 4000) |
| `CORS_ORIGINS` | Comma-separated allowed origins (also used for WebSockets) |
| `APP_URL` | Public URL of the web app |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Random strings, 32+ characters. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` | Token lifetimes (default `15m`, `30`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay test keys. Leave empty to take payment at the counter |
<<<<<<< HEAD
| `STORAGE_DRIVER`, `UPLOAD_DIR` | `local` and the private folder for uploads (never served statically) |
=======
| `STORAGE_DRIVER`, `UPLOAD_DIR` | `local` (private folder, never served statically) or `supabase` (private bucket) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Needed when `STORAGE_DRIVER=supabase`; the key is backend-only |
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
| `MAX_FILE_SIZE_MB` | Upload limit per file (default 25) |
| `FILE_RETENTION_HOURS` | Safety net: delete files of finished orders after this long (default 24). Files are normally deleted right at pickup, deny or cancel |
| `ORPHAN_FILE_RETENTION_HOURS` | Delete uploads not used by a live request this long after upload (default **24**) |
| **`SIGNED_URL_TTL_SECONDS`** | New. How long a file preview/download link works (default 300) |
| **`REQUEST_RATE_LIMIT`** | New. Print requests one customer may send per 10 minutes (default 10) |
| `SMS_PROVIDER`, `DEV_OTP` | `console` logs OTPs; outside production `DEV_OTP` is accepted |
| `DEFAULT_COMMISSION_PERCENT` | Used until an admin sets one |

Client (`frontend/.env`, optional): `VITE_API_URL` if the API is on another origin (Vite proxies `/api` and `/socket.io` in development); `VITE_MAX_FILE_MB` to match `MAX_FILE_SIZE_MB` if you change it.

## Realtime

`socket.io` runs on the API server (`/socket.io`). Clients send their access token when connecting.

| Room | Who joins | Events |
|---|---|---|
| `user:<id>` | every signed-in socket | `order:changed` for the customer's own orders |
| `shop:<id>` | owners, only for shops they own (checked on the server) | `order:changed`, `shop:changed` |
| `queue:<shopId>` | anyone viewing that shop | `queue:changed` |

Events carry only ids and statuses; screens refetch over HTTP, so normal access checks decide what each person sees. If the socket drops, the screens poll every 10–15 seconds and show a "connection lost" note until it reconnects.

## API summary (`/api/v1`)

Money is always in **paise**. Errors look like `{ "error": { "code", "message", "details?" } }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Shops (public) | `GET /shops`, `GET /shops/:idOrSlug`, `GET /shops/:id/queue` |
| Uploads | `POST /uploads` (multipart `files[]`), `GET /uploads`, `GET /uploads/:id/link?d=inline\|attachment` (signed link), `DELETE /uploads/:id` |
| Files | `GET /files/:id?exp&d&sig` (signed, expiring; no login needed) |
| Requests (customer) | `POST /requests/quote`, `POST /requests`, `GET /requests`, `GET /requests/:id`, `POST /requests/:id/cancel` |
| Requests (owner) | `GET /shop/requests?scope=active\|done`, `POST /shop/requests/:id/accept\|deny\|printing\|ready\|collect`, `POST /shop/open` |
| Payments | `POST /payments/create-order` (accepted orders), `POST /payments/verify`, `POST /payments/failed`, `POST /payments/webhook` |
| Shop owner | `GET/PUT /shop/profile`, pricing CRUD under `/shop/pricing`, `GET /shop/analytics`, `GET /shop/orders/export` |
| Admin | under `/admin` (shops, users, orders, payments, refunds, settings, fraud, analytics, audit logs) |

**Pricing** (per file, chat flow uses A4 normal paper): `print = pages × copies × rate`, where the rate depends on colour and on single/double-sided; `binding = spiral rate × copies`; `total = Σ(print + binding) + tax`.

## Security

- **Pickup codes**: random 6 digits (crypto RNG), created on accept, shown only to the customer, checked with a timing-safe compare against one order of the owner's own shop, and cleared after use. Five wrong tries replace the code (the customer's card updates live), and the verify route is rate-limited per owner.
- **Ownership**: every owner route loads the order through the owner's shop (`shopId` + `ownerId`); another shop's order is a 404. Sockets join a shop room only after the same check.
- **Files**: type checked by magic bytes, not by extension; filenames are cleaned; stored under random names outside any public folder; opened only through signed links that expire after 5 minutes; deleted at pickup / deny / cancel, and within 24 hours at most.
- **Privacy**: owners see the customer's phone masked to the last 4 digits.
- **Rate limits**: login, OTP, uploads, request creation (per customer), pickup-code checks, payments and general API traffic.
- Helmet headers with a CSP that allows only Razorpay checkout and the app's WebSocket; CORS allow-list; refresh tokens stored only as HMAC hashes and rotated.

## Razorpay test setup

1. Create an account at <https://dashboard.razorpay.com/signup> and switch to **Test Mode**.
2. **Account & Settings → API Keys → Generate Test Key**; put the Key ID and Secret in `backend/.env`.
3. Optional webhook: `https://<public-host>/api/v1/payments/webhook` with events `payment.captured`, `payment.failed`, `refund.processed` and the same secret in `RAZORPAY_WEBHOOK_SECRET` (use `ngrok http 4000` locally).
4. Pay with the test UPI ID `success@razorpay` (or `failure@razorpay`).

## Deployment

```bash
cp backend/.env.example backend/.env    # strong JWT secrets + Razorpay keys
APP_URL=https://print.example.com docker compose up -d --build
```
The app container applies migrations on start and serves the API, WebSockets and the built frontend on port 4000. Put it behind HTTPS and make sure your proxy forwards WebSocket upgrades for `/socket.io`.

Before going live: switch Razorpay to live keys, plug in a real SMS provider (`backend/src/services/notify.ts`), move uploads to object storage or a persistent volume (`backend/src/services/storage.ts`), and replace the placeholder legal text in `frontend/src/pages/info/InfoPage.tsx`.
