export interface VerifiedToken {
  email?: string;
  email_verified?: boolean;
}

export interface AdminAuthDeps {
  verify: (idToken: string) => Promise<VerifiedToken>;
  adminEmails: readonly string[];
}

export type AdminAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; error: string };

const BEARER_PREFIX = 'Bearer ';

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function authorizeAdmin(
  authorizationHeader: string | null,
  { verify, adminEmails }: AdminAuthDeps,
): Promise<AdminAuthResult> {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return { ok: false, status: 401, error: 'Missing bearer token' };
  }

  let decoded: VerifiedToken;
  try {
    decoded = await verify(authorizationHeader.slice(BEARER_PREFIX.length));
  } catch {
    return { ok: false, status: 401, error: 'Invalid or expired token' };
  }

  const email = decoded.email?.toLowerCase();
  if (!email || !decoded.email_verified || !adminEmails.includes(email)) {
    return { ok: false, status: 403, error: 'Not an admin' };
  }

  return { ok: true, email };
}
