/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb, adminBucket, FieldValue } from '@/lib/firebaseAdmin';
import { openai } from '@/lib/openai';

export const runtime = 'nodejs';

function nyDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

class RateLimitError extends Error {
  usedToday: number;
  cap: number;
  constructor(message: string, usedToday: number, cap: number) {
    super(message);
    this.usedToday = usedToday;
    this.cap = cap;
  }
}

async function uploadPngAndGetUrl(storagePath: string, png: Buffer) {
  const file = adminBucket.file(storagePath);
  const token = randomUUID();
  await file.save(png, {
    contentType: 'image/png',
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const prompt = (body.prompt ?? '').toString().trim();
    const title = (body.title ?? prompt.slice(0, 60)).toString().trim();
    const niche = (body.niche ?? 'general').toString().trim();
    let count = Number(body.count ?? 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 8) count = 8;

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // Daily cap
    const DAILY_CAP = Number(process.env.DAILY_CAP ?? 10);
    const dayKey = nyDayKey();
    const capRef = adminDb.collection('rate_limits').doc('daily').collection('days').doc(dayKey);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(capRef);
      const used = snap.exists ? Number(snap.data()?.used ?? 0) : 0;
      if (used + count > DAILY_CAP) throw new RateLimitError('Daily limit reached', used, DAILY_CAP);
      if (!snap.exists) {
        tx.set(capRef, { day: dayKey, used: count, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      } else {
        tx.update(capRef, { used: FieldValue.increment(count), updatedAt: FieldValue.serverTimestamp() });
      }
    });

    // Generate images
    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: count,
      size: '1024x1024',
    });

    const outputs = result.data ?? [];
    const assets: Array<{ id: string; title: string; niche: string; imageUrl: string }> = [];

    for (let i = 0; i < outputs.length; i++) {
      const item: any = outputs[i];
      let png: Buffer | null = null;

      if (item?.b64_json) {
        png = Buffer.from(item.b64_json, 'base64');
      } else if (item?.url) {
        const r = await fetch(item.url);
        if (!r.ok) continue;
        png = Buffer.from(await r.arrayBuffer());
      }
      if (!png) continue;

      const storagePath = `assets/studio-${Date.now()}-${i + 1}.png`;
      const imageUrl = await uploadPngAndGetUrl(storagePath, png);

      const assetDoc = await adminDb.collection('assets').add({
        title,
        prompt,
        niche,
        imageUrl,
        thumbUrl: imageUrl,
        storagePath,
        source: 'studio',
        published: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      assets.push({ id: assetDoc.id, title, niche, imageUrl });
    }

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No images generated' }, { status: 500 });
    }

    return NextResponse.json({ assets });
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Daily limit reached', usedToday: err.usedToday, cap: err.cap },
        { status: 429 },
      );
    }
    console.error('[studio/generate]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
