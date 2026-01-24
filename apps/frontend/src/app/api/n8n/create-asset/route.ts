/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/n8n/create-asset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminDb, adminBucket, FieldValue } from '@/lib/firebaseAdmin';
import { openai } from '@/lib/openai';

export const runtime = 'nodejs';

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function truthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(s);
  }
  return false;
}

function getOrigin(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl.host ||
    'localhost:3000';
  return `${proto}://${host}`;
}

// YYYY-MM-DD in America/New_York
function nyDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
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

  const bucketName = adminBucket.name;
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(req: NextRequest) {
  // N8N shared secret guard
  const headerSecret = req.headers.get('x-n8n-secret');
  const expectedSecret = process.env.N8N_SHARED_SECRET;
  if (!expectedSecret || headerSecret !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const requestId = randomUUID();

  let runId: string = requestId;
  let rowId: string | number | null = null;
  let jobRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    const body = await req.json();

    runId = body.runId ?? requestId;
    rowId = body.rowId ?? body.id ?? null;

    const promptRaw = (body.prompt ?? '').toString().trim();
    const niche = (body.niche ?? 'general').toString();
    const title = (body.title ?? 'AI generated design').toString();
    const style = body.style ? body.style.toString() : '';

    let count = Number(body.count ?? 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > 8) count = 8;

    const isMock =
      truthy(body.mock) ||
      truthy(process.env.MOCK_MODE) ||
      truthy(process.env.NEXT_PUBLIC_MOCK_MODE);

    if (!promptRaw) {
      return NextResponse.json(
        { ok: false, requestId, runId, rowId, error: 'Missing prompt' },
        { status: 400 },
      );
    }

    // Create job doc first
    jobRef = await adminDb.collection('jobs').add({
      requestId,
      runId,
      rowId: rowId?.toString?.() ?? rowId,
      status: 'pending',
      title,
      niche,
      style,
      requestedCount: count,
      isMock,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    log('create_asset.start', {
      requestId,
      runId,
      rowId,
      jobId: jobRef.id,
      count,
      isMock,
    });

    // MOCK: create assets docs pointing to /mock.png
    if (isMock) {
      const origin = getOrigin(req);
      const placeholderUrl = process.env.MOCK_IMAGE_URL || `${origin}/mock.png`;

      const assets: Array<{ assetId: string; imageUrl: string }> = [];

      for (let i = 0; i < count; i++) {
        const assetId = `mock-${jobRef.id}-${i + 1}`;

        await adminDb
          .collection('assets')
          .doc(assetId)
          .set({
            title,
            prompt: promptRaw,
            niche,
            style,
            imageUrl: placeholderUrl,
            thumbUrl: placeholderUrl,
            storagePath: '',
            source: 'mock',
            runId,
            rowId: rowId?.toString?.() ?? rowId,
            jobId: jobRef.id,
            published: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

        assets.push({ assetId, imageUrl: placeholderUrl });
      }

      await jobRef.update({
        status: 'mock_done',
        assets,
        generatedCount: assets.length,
        finishedAt: FieldValue.serverTimestamp(),
        ms: Date.now() - startedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          ok: true,
          requestId,
          runId,
          rowId,
          jobId: jobRef.id,
          mock: true,
          count: assets.length,
          assets,
        },
        { status: 200 },
      );
    }

    // DAILY CAP counter doc (NY day key)
    const DAILY_CAP = Number(process.env.DAILY_CAP ?? 10);
    const dayKey = nyDayKey();
    const capRef = adminDb
      .collection('rate_limits')
      .doc('daily')
      .collection('days')
      .doc(dayKey);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(capRef);
      const used = snap.exists ? Number(snap.data()?.used ?? 0) : 0;

      if (used + count > DAILY_CAP)
        throw new RateLimitError('Daily limit reached', used, DAILY_CAP);

      if (!snap.exists) {
        tx.set(capRef, {
          day: dayKey,
          tz: 'America/New_York',
          used: count,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(capRef, {
          used: FieldValue.increment(count),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    const prompt = style ? `${promptRaw}\nStyle: ${style}` : promptRaw;

    const result = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: count,
      size: '1024x1024',
    });

    const data = result.data ?? [];
    const assets: Array<{ assetId: string; imageUrl: string }> = [];

    for (let i = 0; i < data.length; i++) {
      const item: any = data[i];
      let png: Buffer | null = null;

      if (item?.b64_json) {
        png = Buffer.from(item.b64_json, 'base64');
      } else if (item?.url) {
        const r = await fetch(item.url);
        if (!r.ok) continue;
        png = Buffer.from(await r.arrayBuffer());
      }
      if (!png) continue;

      const storagePath = `assets/${rowId ?? 'row'}-${jobRef.id}-${Date.now()}-${i + 1}.png`;
      const imageUrl = await uploadPngAndGetUrl(storagePath, png);

      const assetDoc = await adminDb.collection('assets').add({
        title,
        prompt: promptRaw,
        niche,
        style,
        imageUrl,
        thumbUrl: imageUrl,
        storagePath,
        source: 'n8n',
        runId,
        rowId: rowId?.toString?.() ?? rowId,
        jobId: jobRef.id,
        published: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      assets.push({ assetId: assetDoc.id, imageUrl });
    }

    if (assets.length === 0) {
      await jobRef.update({
        status: 'error',
        error: 'No images generated',
        generatedCount: 0,
        ms: Date.now() - startedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json(
        {
          ok: false,
          requestId,
          runId,
          rowId,
          jobId: jobRef.id,
          error: 'No images generated',
        },
        { status: 500 },
      );
    }

    await jobRef.update({
      status: 'done',
      generatedCount: assets.length,
      ms: Date.now() - startedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        runId,
        rowId,
        jobId: jobRef.id,
        count: assets.length,
        assets,
      },
      { status: 200 },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? 'Internal server error');

    try {
      if (jobRef) {
        await jobRef.update({
          status: 'error',
          error: msg,
          ms: Date.now() - startedAt,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch {}

    log('create_asset.crash', {
      requestId,
      runId,
      rowId,
      jobId: jobRef?.id ?? null,
      message: msg,
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        runId,
        rowId,
        jobId: jobRef?.id ?? null,
        error: msg,
      },
      { status: 500 },
    );
  }
}
