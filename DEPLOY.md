# Deploying PRINT POINT

| Part | Host |
|---|---|
| Frontend (`frontend/`) | Vercel |
| Backend (`backend/`) | Render (runs `backend/Dockerfile`) |
| Database | Supabase Postgres |

Copy `deploy-settings.example.env` to `deploy-settings.env` (git-ignored) and keep your values there while you go.

## 1. Supabase - database
1. Create a project and save the database password.
2. **Connect → Session pooler** → copy the URI into `SUPABASE_DATABASE_URL`.
   (Use the *session* pooler, port 5432 - Prisma migrations don't work on the transaction pooler.)
<<<<<<< HEAD
=======
3. **Storage → New bucket** named `uploads`, with **Public bucket turned off**. Customer files are private; the backend hands out short-lived signed links itself.
4. **Project Settings → API** → copy the Project URL into `SUPABASE_URL` and the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses all Supabase security: it goes on Render only, never on Vercel or in the frontend.
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7

## 2. Render - backend
1. **New → Web Service** → connect the GitHub repo.
2. Runtime: **Docker**. **Root Directory: `backend`** (the `Dockerfile` is in `backend/`).
3. Paste section 3 of `deploy-settings.env` into **Environment**. Leave `CORS_ORIGINS` / `APP_URL` as a placeholder for now.
4. Deploy. Tables are created automatically on start (`prisma migrate deploy`).
5. Copy the service URL into `BACKEND_URL`. Check `BACKEND_URL/api/v1/health` shows `{"ok":true,...}`.

## 3. Vercel - frontend
1. **Add New → Project** → import the repo.
2. **Root Directory: `frontend`**. Framework: Vite (auto-detected).
3. Add `VITE_API_URL` = your `BACKEND_URL` and `VITE_MAX_FILE_MB`.
4. Deploy, then copy the URL into `FRONTEND_URL`.

## 4. Connect them
On Render set `CORS_ORIGINS` and `APP_URL` to your `FRONTEND_URL`, then redeploy.
If you change `VITE_API_URL` later, redeploy on Vercel (it's baked in at build time).

## 5. Razorpay webhook (if using payments)
Webhook URL: `BACKEND_URL/api/v1/payments/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`.

## Things to know
<<<<<<< HEAD
- **Uploaded files**: Render's disk is wiped on every redeploy/restart. Fine for testing; for real use add a Render persistent disk mounted at `/app/uploads`, or move uploads to Supabase Storage.
- **Free Render plan** sleeps after ~15 min idle; the first request then takes ~30-50 s.
- **Demo data**: inside `backend/`, run `npm run db:seed` with `DATABASE_URL` set to the Supabase URL.
- **Demo mode (on by default)**: nobody signs in. Every visitor gets a "View as" bar to switch between Customer, Shop owner and Admin, and anyone can act as the admin. It needs the seeded users, so run the seed above once. To require real sign-in later, set `DEV_SKIP_LOGIN=false` on Render and `VITE_SKIP_LOGIN=false` on Vercel, then redeploy both.
=======
- **Uploaded files**: with `STORAGE_DRIVER=supabase` they live in the private `uploads` bucket and survive redeploys. With `local`, Render's disk is wiped on every redeploy/restart.
- **Free Render plan** sleeps after ~15 min idle; the first request then takes ~30-50 s.
- **Demo data**: inside `backend/`, run `npm run db:seed` with `DATABASE_URL` set to the Supabase URL.
- **Demo mode (off by default)**: real sign-in is required. For a throwaway demo site where nobody signs in and anyone can act as admin, set `DEV_SKIP_LOGIN=true` and `ALLOW_DEMO_IN_PROD=true` on Render and `VITE_SKIP_LOGIN=true` on Vercel, run the seed above once, then redeploy both. Without `ALLOW_DEMO_IN_PROD=true` the API refuses to start in demo mode. Never use demo mode with live Razorpay keys or real customers.
>>>>>>> fc060c7b2d80010a918ee9c381a985626c1701c7
