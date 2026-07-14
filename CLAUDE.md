# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered e-commerce platform for merchandise generation and sales. Customers can generate AI artwork (DALL-E), apply it to merchandise mockups, and purchase products. The active app lives in `apps/frontend/`.

## Cost Discipline

Billed via Claude Pro/Max subscription, not metered API — there is no per-session dollar target. Discipline is about **usage-window quota**, not spend: watch Claude Code's own usage-limit indicator, and avoid burning through the rolling window faster than the work requires.

- **Model:** Default to **Sonnet**. Escalate to Opus (`/model opus`) only for genuinely hard work — multi-file refactors, architecture, gnarly debugging. Short, mechanical turns (CSV/sheet edits, status checks, single-line fixes, lookups) belong on Sonnet. Heavier models and deeper thinking still consume more of the usage window per message even though there's no per-token bill.
- **Subagent fan-out:** Each dispatched subagent draws from the same usage pool. Prefer direct execution over spinning up implementer/reviewer subagent pairs for small, well-specified tasks; reserve subagent-driven workflows for genuinely parallel or independent work.
- **Reads:** Consult **File Cheat-Sheets** (below) before opening a summarized file; open the file only for the exact lines you'll change. Never re-`Read` `MEMORY.md` — it is auto-injected into context every session. Don't read full CSVs; grep or read ranges.
- **When a file shows up as a repeat-read across sessions,** add a summary to File Cheat-Sheets instead of re-reading it.

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

## File Cheat-Sheets

Summaries of frequently-read files — consult these before opening the file; only open it for the exact lines you need to change.

**`src/lib/printify.ts`** — Printify API client (server-side only; needs `PRINTIFY_API_KEY` + `PRINTIFY_SHOP_ID`). Exports:

- `BLUEPRINT_IDS` / `PRINT_PROVIDER_IDS` — category→ID maps for `shirt`(12/99), `hoodie`(92/99), `tote`(553/217), `mug`(68/1), `cup`(425/1). Verified against live catalog 2026-06-25.
- `fetchVariantIds(blueprintId, printProviderId, category)` — fetches Black S/M/L/XL variant IDs from catalog (apparel matches "Black"/"Jet Black" titles; drinkware/totes take first available). In-memory `variantCache`. Falls back to hardcoded `VARIANT_IDS` on API failure.
- `uploadImageToPrintify(imageUrl, fileName)` — fetches image server-side (Recraft CDN blocks Printify's servers), converts to JPEG 80% via `sharp` to shrink before base64, POSTs to `/uploads/images.json`.
- `createPrintifyProduct({title, description, productCategory, printifyImageId, tags})` — builds product with front print area, price 2500 (cents), all variants enabled.
- `getPrintifyMockupUrl(productId, {retries=5, initialDelayMs=5000})` — polls product with linear backoff for the default mockup `src`; returns `null` if never ready.
- `publishPrintifyProduct(productId)` — POSTs publish with all fields enabled.

**`src/app/shop/[productId]/page.tsx`** — client component (`'use client'`) product detail page. Loads Firestore `assets/{productId}` doc. Resolves mockup via `data.mockupUrl ?? data.imageUrl`. Size selector (`SIZES = XS–2XL`) shown only for apparel (`APPAREL = shirt|hoodie|tote`); apparel requires a size before Add to Cart. Cart writes to `localStorage` key `aiMerchCart` as flat `FlatCartItem[]`, dedup-keyed on `productId`+`size`. "Customize" link shows only when `defaultAssetId` is set. Inline-styled dark theme.

> **`MEMORY.md` is auto-injected into context every session** — never `Read` it explicitly.

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

**Production is a GCP VM running the app in Docker via `docker compose`.** This is manual, not automatic — pushing to `main` does NOT deploy by itself.

Canonical deploy flow, run on the VM (not the n8n host — they are different machines; confirm with `ps aux | grep node` before trusting `docker logs` output):

```bash
cd ~/Project_AI_Merch/apps/frontend
git pull origin main
sudo docker compose up --build -d
sudo docker logs ai-merch-frontend --tail 20
```

- Container name: `ai-merch-frontend`, port 3000, restart policy `unless-stopped`. Restart a stopped container with `sudo docker start ai-merch-frontend`.
- `docker-compose.yml` lives at `apps/frontend/docker-compose.yml` and reads `.env.production` (not `.env.local`).
- All docker commands on the VM require `sudo`.
- **Disk fills up over time** from accumulated image layers/build cache across repeated `--build` runs — if a build fails with `ResourceExhausted: ... no space left on device`, run `df -h` to confirm, then `sudo docker system df` to see the reclaimable breakdown, then `sudo docker builder prune -af` followed by `sudo docker image prune -af` (avoid `--volumes`, it can also wipe named volumes). Both prune commands can be slow to the point of looking hung when the disk is near-full — check `df -h` in a second session for actual progress before assuming it's stuck.
- `next.config.js` uses `output: 'standalone'` for container optimization. Remote image domains are whitelisted for Firebase Storage, Azure DALL-E, and Google Auth profile images.

**Known open item — TODO, not yet resolved:** `apps/frontend/apphosting.yaml` (service `ai-merch-store`, region `us-central1`) exists from a partial migration to Firebase App Hosting (Cloud Run) that was never finished. It is not live and should not be assumed to be the deploy target. Decide whether to finish that migration or remove the leftover config — until then, the GCP VM above is the only real production target.

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
  3. **Queue Filter** — validates each row; adds `queue_ok` flag based on `n8n_status` (blank/`todo`/`rate_limited` = eligible).
  4. **Eligible Filter** — passes only rows where `queue_ok === true` to OpenAI and the Merge node, skipping done/error rows without burning API calls.
  5. GPT-4.1-mini builds a refined prompt from the `concept` field
  6. **If1 node** gates routing: `live-mode === false` OR `queue_ok === false` → dry-run path; otherwise → Generate assets
  7. **Generate assets** — POSTs to `https://ai-merch.jjrsguide.com/api/n8n/create-asset` with header `x-n8n-secret`
  8. Updates the sheet row status and increments the daily config counter

### Google Sheets Integration

- **Credential ID:** `3eB88qFdgc8kvhY7` (OAuth2)
- **Products sheet:** `1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM` — "AI Merch - Asset Generation System", Sheet1 (gid=164939025)
- **Config sheet:** `1dzzB1dxqgbhijD9hcDFioZHGzUn6BQaU79NNKmr_NkU` — "AI Merch - Config", Sheet1 (gid=1495447911), key=`daily`
- Product columns: `id`, `rowId`, `title`, `niche`, `concept`, `styleTag`, `colorPalette`, `product_category`, `size`, `priority`, `live-mode`, `n8n_status`, `n8n_error`, `assetIds`, `imageUrl`, `firebaseProductId`, `published`, `lastRun`, `retryCount`, `notes`
- `n8n_status` drives the queue: blank/`todo`/`rate_limited` = eligible; `done`/`pending`/`error` = skipped

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
| 5   | Start/Stop GCP nodes orphaned                     | Disconnected nodes, no current purpose — review before activating scheduled runs                                  |
| 6   | Switch node routes all product types to same path | Product-type-specific routing (mug vs shirt vs etc.) is wired but non-functional; all outputs go to the same node |
