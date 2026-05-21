# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered e-commerce platform for merchandise generation and sales. Customers can generate AI artwork (DALL-E), apply it to merchandise mockups, and purchase products. The active app lives in `apps/frontend/`.

## Commands

All commands run from `apps/frontend/`:

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build (standalone output)
npm run lint     # ESLint
npm start        # Start production server
```

Node 20 required (`.nvmrc` present). Use `nvm use` before running.

## Architecture

**Monorepo:** `apps/frontend/` is the only active app. `config/` and `docs/` at root are empty.

**Framework:** Next.js 16 App Router (`src/app/`), TypeScript 5, React 19, Tailwind CSS v4.

**Routing structure:**

- `/studio/generate` — AI asset generation (DALL-E via OpenAI)
- `/shop`, `/products`, `/product/[productId]` — storefront
- `/admin/*` — product and order management (protected routes)
- `/gallery`, `/asset/[assetId]` — asset browsing
- `/cart`, `/checkout/*`, `/orders` — purchase flow

**API routes** (`src/app/api/`):

- `generate-asset` — calls OpenAI DALL-E
- `create-checkout-session` / `stripe-webhook` — Stripe payments
- `save-mockup` — persists design mockups
- `n8n/create-asset` — n8n workflow integration

**State management:** React Context only — `AuthContext` (Firebase Auth) and `CartContext`. No Redux or Zustand.

**Core lib files:**

- `src/lib/firebase.ts` — client-side Firebase init (safe for build time — handles missing keys)
- `src/lib/firebaseAdmin.ts` — server-side Admin SDK (credentials from `FIREBASE_SERVICE_ACCOUNT_B64`, base64-encoded JSON)
- `src/lib/stripe.ts`, `src/lib/openai.ts` — service clients
- `src/lib/types.ts` — shared TypeScript types
- `src/lib/promptTemplates.ts` — DALL-E prompt construction

**Styling:** Dark theme forced in `layout.tsx`. Tailwind v4 via `@tailwindcss/postcss`. CSS variables `--color-primary` and `--font-heading` used for theming.

## Environment Variables

Create `apps/frontend/.env.local` for local dev. Never commit this file.

**Client-side (NEXT*PUBLIC*\*):**

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_BASE_URL
```

**Server-side secrets:**

```text
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
FIREBASE_SERVICE_ACCOUNT_B64   # base64-encoded service account JSON
N8N_SHARED_SECRET              # optional
```

## Deployment

Deployed to Firebase App Hosting (Cloud Run). Push to `main` triggers automatic deploy via Cloud Build → `npm run build` → Cloud Run.

Config: `apps/frontend/apphosting.yaml` (service: `ai-merch-store`, region: `us-central1`, 0–10 instances).

`next.config.js` uses `output: 'standalone'` for container optimization. Remote image domains are whitelisted for Firebase Storage, Azure DALL-E, and Google Auth profile images.

## Key Gotchas

- **Firebase init at build time:** `firebase.ts` must not throw when env vars are absent — SSG runs without them. Check before adding new Firebase calls at module scope.
- **Hydration suppression:** `suppressHydrationWarning` on `<body>` in `layout.tsx` is intentional — browser extensions cause mismatches.
- **Stripe webhooks:** Raw body required for signature verification — don't add body parsers to the webhook route.
- **Canvas/Konva:** `react-konva` requires client-only rendering; use dynamic imports with `ssr: false` for any Konva components.

## n8n Automation Layer

### Overview

A self-hosted n8n instance at `https://n8n.jjrsguide.com` handles batch asset generation. It reads pending rows from a Google Sheet, calls GPT-4.1-mini to build prompts, then POSTs to the app's `/api/n8n/create-asset` endpoint to generate and persist DALL-E assets. This offloads bulk generation from the frontend so users don't trigger it directly.

### Key Workflow: AI_Merch - Batch from Sheet

- **Workflow ID:** `HlxK50rV54KSiNRD`
- **Trigger:** Manual (UI) or scheduled
- **Flow summary:**
  1. Reads a config row from Google Sheets (daily quota, date)
  2. Reads product rows from the sheet (columns: id, concept/prompt, n8n_status, live-mode, etc.)
  3. **Queue Filter** — validates each row; only passes rows where `n8n_status` is blank / `todo` / `rate_limited`. Currently hardcoded to process **index 0 only** (one row per run — batch processing intentionally disabled while testing).
  4. GPT-4.1-mini builds a refined prompt from the concept field
  5. **If1 node** gates routing: `live-mode === false` OR `queue_ok === false` → dry-run path; otherwise → Generate assets
  6. **Generate assets** — POSTs to `https://ai-merch.jjrsguide.com/api/n8n/create-asset` with header `x-n8n-secret`
  7. Updates the sheet row status and increments the daily config counter

### Google Sheets Integration

- **Credential ID:** `3eB88qFdgc8kvhY7` (OAuth2)
- Sheet has two ranges: a config row (key=`daily`, tracks date + `imagesGeneratedToday`) and product rows
- `n8n_status` column drives the queue: blank/`todo`/`rate_limited` = eligible; `done`/`pending`/`error` = skipped

### AI-Merch API

- **Endpoint:** `https://ai-merch.jjrsguide.com/api/n8n/create-asset`
- **Auth header:** `x-n8n-secret: rmPIzCVTTYukUUgZa3w06HZZ`
- Corresponds to `src/app/api/n8n/create-asset/` in this repo — this is the server-side handler that receives the n8n POST and triggers DALL-E generation + Firebase persistence

### MCP Server (Claude ↔ n8n)

A custom MCP server at `/home/ibjjr/.claude/n8n_mcp.py` lets Claude interact with n8n directly via tools: `list_workflows`, `get_workflow`, `update_workflow`, `create_workflow`, `activate_workflow`, `deactivate_workflow`, `delete_workflow`, `get_executions`.

Requires env vars:

```text
N8N_BASE_URL=https://n8n.jjrsguide.com
N8N_API_KEY=<JWT from ~/.bashrc>
```

n8n REST API v1 — `PUT /api/v1/workflows/:id` accepts only: `name, nodes, connections, settings, staticData`. Strip all metadata fields before updating.

### OpenAI Credential

- **Credential ID:** `exk4Ofy7yL07H7ei` (GPT-4.1-mini, used in "Message a model1" node)

### Known Open Issues

| #   | Issue                                             | Notes                                                                                                             |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 3   | Queue Filter passes index 0 only — batch disabled | Intentional safety limit during testing; remove the `if (index > 0)` guard when ready for production batch runs   |
| 5   | Start/Stop GCP nodes orphaned                     | Disconnected nodes, no current purpose — review before activating scheduled runs                                  |
| 6   | Switch node routes all product types to same path | Product-type-specific routing (mug vs shirt vs etc.) is wired but non-functional; all outputs go to the same node |
