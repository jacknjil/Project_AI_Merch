// Shared credential loader for ops/firebase-admin scripts.
// Prefers FIREBASE_SERVICE_ACCOUNT_B64 — the raw-JSON form breaks env-file
// parsers on the embedded commas in the private key (see project memory:
// two Firebase key leaks traced back to this exact var).
export function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_B64 is set but invalid.');
      process.exit(1);
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      console.error(
        'ERROR: FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON. Use FIREBASE_SERVICE_ACCOUNT_B64 instead.',
      );
      process.exit(1);
    }
  }

  console.error('ERROR: Missing FIREBASE_SERVICE_ACCOUNT_B64 (or legacy FIREBASE_SERVICE_ACCOUNT_JSON) in .env');
  process.exit(1);
}
