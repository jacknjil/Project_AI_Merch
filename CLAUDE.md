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
