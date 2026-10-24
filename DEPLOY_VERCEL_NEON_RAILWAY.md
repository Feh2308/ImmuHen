# ImmuHen: Vercel + Railway + Neon

## Vercel (frontend)

Configure `frontend` as the Vercel root directory:

```text
Build command: npm run build
Output directory: dist
Environment: VITE_API_URL=https://SEU-BACKEND.up.railway.app
VITE_VACCINATOR_APP_URL=https://SEU-APP-VACINADOR.vercel.app
```

For the separate `vaccinator-app`, use another Vercel project:

```text
Build command: npm run build
Output directory: dist
VITE_API_URL=https://SEU-BACKEND.up.railway.app
VITE_BASE_PATH=/
```

## Railway (backend)

Create a Railway service from the `backend` directory. The included `Dockerfile` and
`railway.json` start the API using Railway's `PORT`.

Set these variables in Railway. Never commit their values:

```text
DATABASE_URL=<Neon pooled connection string>
DIRECT_URL=<Neon direct connection string>
VACITECH_STATE_STORAGE=database
BIRDLOTS_STORAGE=database
CORS_ORIGIN=https://SEU-FRONTEND.vercel.app,https://SEU-VACINADOR.vercel.app
API_PUBLIC_URL=https://SEU-BACKEND.up.railway.app
FRONTEND_PUBLIC_URL=https://SEU-FRONTEND.vercel.app
AUTH_SECRET=<chave longa e aleatoria>
OWNER_ADMIN_KEY=<chave forte>
SUBSCRIPTION_ADMIN_KEY=<chave forte>
SUBSCRIPTION_ENFORCEMENT=on
PORT=3001
```

Run Prisma migrations once against Neon from the backend directory:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
```

The browser talks only to Railway. Neon is never exposed to the browser. Tenant
separation continues to be enforced by the API and its tenant-scoped storage.

## Offline behavior

Install the frontend as a PWA at the granja. The service worker keeps the application
shell available without internet. Data writes must be synchronized through the API
when connectivity returns; do not put Neon credentials in Vercel or browser code.
