import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdmin';
import { authorizeAdmin, parseAdminEmails } from '@/lib/adminAuthCore';

/**
 * Guard for admin-only API routes. Returns a NextResponse (401/403) to send
 * back when the caller is not an allowlisted admin, or null when the request
 * may proceed. Admins are listed in the ADMIN_EMAILS env var (comma-separated);
 * an unset or empty list denies everyone.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const result = await authorizeAdmin(req.headers.get('authorization'), {
    verify: (idToken) => getAdminAuth().verifyIdToken(idToken),
    adminEmails: parseAdminEmails(process.env.ADMIN_EMAILS),
  });

  if (result.ok) return null;
  return NextResponse.json({ error: result.error }, { status: result.status });
}
