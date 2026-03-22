# Deployment Guide

This repository is set up for the simplest reliable production topology:

- frontend on Vercel
- FastAPI backend deployed separately

## Recommended production topology

### Frontend

- Platform: Vercel
- Project root: `apps/web`
- Framework: Next.js

### Backend

- Platform: Render
- Service type: Web Service
- Blueprint option: `render.yaml` at the repo root

## Why the backend should be deployed separately

Yes, the FastAPI backend should be deployed separately.

Reasons:

- the frontend is a standard Next.js app and fits Vercel cleanly
- the backend is a long-running Python API, which is a better fit for a dedicated Python host
- separating them keeps the current architecture intact and the deployment path simpler

## Required production URLs and environment variables

### Frontend environment variable

Set one of these in Vercel:

- `API_URL=https://YOUR-API-HOST/api`
- `NEXT_PUBLIC_API_URL=https://YOUR-API-HOST/api`

Example:

- `API_URL=https://orya-one-racesim-api.onrender.com/api`

The frontend now calls the backend through a same-origin Next.js proxy route. That means the browser talks to Vercel, and Vercel talks to the FastAPI backend server-to-server.

### Backend environment variable

Set this on the backend host:

- `CORS_ORIGINS=https://YOUR-FRONTEND-HOST`

Example:

- `CORS_ORIGINS=https://orya-one-racesim.vercel.app`

If you use a custom domain, include that too:

- `CORS_ORIGINS=https://orya-one-racesim.vercel.app,https://racesim.oryaone.com`

## Development behavior

Local development still works with the existing setup:

- if neither `API_URL` nor `NEXT_PUBLIC_API_URL` is set and `NODE_ENV=development`, the frontend proxy falls back to `http://localhost:8000/api`
- in production, set `API_URL` in Vercel

## Vercel deployment steps

### Dashboard path

1. Push the repository to GitHub.
2. Open Vercel and click `Add New...` -> `Project`.
3. Import the repository.
4. In project configuration, set the `Root Directory` to `apps/web`.
5. Confirm the framework is detected as `Next.js`.
6. Open the environment variable section and add:
   - `API_URL`
7. Set the value to your deployed backend URL with the `/api` suffix.
8. Apply the variable to `Production` and `Preview`.
9. Click `Deploy`.

After the first deploy:

10. Open the deployed project in Vercel.
11. If you want a custom domain, open `Settings` -> `Domains` and add it there.
12. If you change `API_URL`, redeploy the project so the updated value is applied.

## Render deployment steps for the API

The easiest path is Render.

### Option A: use the included `render.yaml`

1. Push the repository to GitHub.
2. Open Render.
3. Click `New` -> `Blueprint`.
4. Select the repository.
5. Render will detect `render.yaml`.
6. Create the service.
7. After creation, open the service settings and set:
   - `CORS_ORIGINS`
8. Redeploy once the frontend URL is known.

### Option B: create the Web Service manually

Use these values:

- Language: `Python 3`
- Build Command: `pip install -r apps/api/requirements.txt && pip install -e packages/sim-core`
- Start Command: `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Then add:

- `CORS_ORIGINS=https://YOUR-FRONTEND-HOST`

## Recommended deployment order

Use this order:

1. Deploy the backend first on Render.
2. Copy the Render service URL.
3. Deploy the frontend on Vercel with `NEXT_PUBLIC_API_URL` pointing to the Render URL plus `/api`.
4. Copy the Vercel frontend URL.
5. If you still want direct browser access to the backend, set `CORS_ORIGINS` to the Vercel frontend URL.
6. Redeploy the backend.
7. If needed, redeploy the frontend once more after final domain changes.

## Best production values

### Frontend on Vercel

- `API_URL=https://orya-one-racesim-api.onrender.com/api`

### Backend on Render

- `CORS_ORIGINS=https://orya-one-racesim.vercel.app`

## Common deployment mistakes

- forgetting the `/api` suffix in `API_URL`
- deploying the frontend before the backend URL exists
- setting backend CORS to `localhost` only
- changing environment variables without redeploying
- pointing Vercel at the repo root instead of `apps/web`

## Manual launch checklist

- backend service is live and returns `/api/health`
- frontend Vercel project uses `apps/web` as root directory
- `API_URL` is set on Vercel
- frontend loads defaults successfully through the proxy route
- running a simulation from the live site returns results
