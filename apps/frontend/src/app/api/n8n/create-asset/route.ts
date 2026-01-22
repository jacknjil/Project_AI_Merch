// src/app/api/save-mockup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb, adminBucket, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

async function uploadPngAndGetUrl(storagePath: string, png: Buffer) {
  const file = adminBucket.file(storagePath);
  const token = randomUUID();

  await file.save(png, {
    contentType: 'image/png',
    resumable: false,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const bucketName = adminBucket.name;
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataUrl, assetId, productId } = body ?? {};

    if (!dataUrl || !assetId || !productId) {
      return NextResponse.json(
        { error: 'Missing dataUrl, assetId, or productId' },
        { status: 400 },
      );
    }

    // Expecting: data:image/png;base64,AAAA...
    const matches = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: 'Invalid data URL format' },
        { status: 400 },
      );
    }

    const base64 = matches[1];
    const buffer = Buffer.from(base64, 'base64');

    // 1) Upload to Firebase Storage (Admin SDK)
    const filename = `mockups/${Date.now()}-${randomUUID()}.png`;
    const imageUrl = await uploadPngAndGetUrl(filename, buffer);

    // 2) Create Firestore doc (Admin SDK)
    const docRef = await adminDb.collection('mockups').add({
      assetId: String(assetId),
      productId: String(productId),
      imageUrl,
      storagePath: filename,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id, imageUrl }, { status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('Error in save-mockup API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
