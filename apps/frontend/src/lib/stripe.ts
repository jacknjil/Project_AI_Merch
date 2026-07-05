import Stripe from 'stripe';

// Nullable so importing this module never throws at build time (Next.js
// evaluates route modules during `next build` without runtime secrets).
// Consumers must check for null before use.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  : null;
