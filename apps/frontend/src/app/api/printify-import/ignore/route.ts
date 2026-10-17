import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { printifyProductId, title } = body ?? {};

    if (!printifyProductId) {
      return NextResponse.json(
        { error: 'Missing required field: printifyProductId' },
        { status: 400 },
      );
    }

    await adminDb.collection('printifyImportIgnores').doc(String(printifyProductId)).set({
      title: title ? String(title) : '',
      ignoredAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/ignore error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
