// src/app/api/save-mockup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb, adminBucket, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

async function uploadImageAndGetUrl(
  storagePath: string,
  image: Buffer,
  contentType: string,
) {
  const file = adminBucket.file(storagePath);
  const token = randomUUID();

  await file.save(image, {
    contentType,
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

    // Expecting: data:image/jpeg;base64,AAAA... (or legacy image/png)
    const matches = String(dataUrl).match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: 'Invalid data URL format' },
        { status: 400 },
      );
    }

    const [, imageFormat, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    const extension = imageFormat === 'jpeg' ? 'jpg' : 'png';

    // 1) Upload to Storage
    const storagePath = `mockups/${Date.now()}-${randomUUID()}.${extension}`;
    const imageUrl = await uploadImageAndGetUrl(
      storagePath,
      buffer,
      `image/${imageFormat}`,
    );

    // 2) Write Firestore doc
    const docRef = await adminDb.collection('mockups').add({
      assetId: String(assetId),
      productId: String(productId),
      imageUrl,
      storagePath,
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
