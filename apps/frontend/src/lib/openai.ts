import OpenAI from "openai";

// Lazily constructed so importing this module never throws at build time
// (Next.js evaluates route modules during `next build` without runtime
// secrets) — mirrors the adminDb/adminBucket Proxy pattern in firebaseAdmin.ts.
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getOpenAI();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
