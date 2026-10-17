import { describe, it, expect, vi } from 'vitest';
import { authorizeAdmin, parseAdminEmails } from './adminAuthCore';

const adminEmails = parseAdminEmails('Admin@Example.com, other@example.com');

describe('parseAdminEmails', () => {
  it('lowercases, trims and drops empty entries', () => {
    expect(parseAdminEmails(' A@x.com ,, b@x.com ')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns an empty list when the variable is unset', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe('authorizeAdmin', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const verify = vi.fn();

    const result = await authorizeAdmin(null, { verify, adminEmails });

    expect(result).toEqual({ ok: false, status: 401, error: 'Missing bearer token' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns 401 when the header is not a Bearer token', async () => {
    const result = await authorizeAdmin('Basic abc', { verify: vi.fn(), adminEmails });

    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('returns 401 when token verification throws', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('expired'));

    const result = await authorizeAdmin('Bearer bad', { verify, adminEmails });

    expect(result).toEqual({ ok: false, status: 401, error: 'Invalid or expired token' });
  });

  it('returns 403 when the email is not on the allowlist', async () => {
    const verify = vi.fn().mockResolvedValue({ email: 'rando@example.com', email_verified: true });

    const result = await authorizeAdmin('Bearer t', { verify, adminEmails });

    expect(result).toEqual({ ok: false, status: 403, error: 'Not an admin' });
  });

  it('returns 403 when the email is on the allowlist but not verified', async () => {
    const verify = vi.fn().mockResolvedValue({ email: 'admin@example.com', email_verified: false });

    const result = await authorizeAdmin('Bearer t', { verify, adminEmails });

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('returns 403 when the allowlist is empty (fails closed)', async () => {
    const verify = vi.fn().mockResolvedValue({ email: 'admin@example.com', email_verified: true });

    const result = await authorizeAdmin('Bearer t', { verify, adminEmails: [] });

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('returns ok for an allowlisted, verified email regardless of case', async () => {
    const verify = vi.fn().mockResolvedValue({ email: 'ADMIN@example.com', email_verified: true });

    const result = await authorizeAdmin('Bearer good', { verify, adminEmails });

    expect(result).toEqual({ ok: true, email: 'admin@example.com' });
    expect(verify).toHaveBeenCalledWith('good');
  });
});
