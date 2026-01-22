/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { adminDb, adminBucket, FieldValue } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

// ---------- helpers ----------

function log(event: string, data: Record<string, any> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function parseBool(v: any): boolean {
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

// Get YYYY-MM-DD parts in a specific IANA timezone (e.g. America/New_York)
function getYMDInTZ(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

// Returns timezone offset in ms for a given instant
function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';

  const asUTC = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second')),
  );

  return asUTC - date.getTime();
}

// Convert a wall-clock time in a timezone to an actual UTC Date.
// We iterate twice to handle DST boundaries correctly enough for “start of day”.
function zonedTimeToUtcDate(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
) {
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let t = utcGuess;

  for (let i = 0; i < 2; i++) {
    const off = getTimeZoneOffsetMs(timeZone, new Date(t));
    t = utcGuess - off;
  }

  return new Date(t);
}

async function getUsedTodayCount(timeZone: string) {
  const { year, month, day } = getYMDInTZ(new Date(), timeZone);
  const dayStart = zonedTimeToUtcDate(timeZone, year, month, day, 0, 0, 0);

  // Use Firestore aggregation count() when available
  const db = adminDb;
  const q = db.collection('assets').where('createdAt', '>=', dayStart);

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - count() exists in modern Firestore server SDK
    const snap = await q.count().get();
    return { used: Number(snap.data().count ?? 0), dayStart };
  } catch {
    // Fallback (ok for early-stage small datasets; less ideal at scale)
    const snap = await q.get();
    return { used: snap.size, dayStart };
  }
}

function makeFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
) {
  // Note: bucketName may be like "ai-merch-dev.firebasestorage.app"
  const encPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encPath}?alt=media&token=${token}`;
}

async function uploadPngAndGetUrl(storagePath: string, png: Buffer) {
  const bucket = adminBucket;
  const file = bucket.file(storagePath);
  const token = randomUUID();

  await file.save(png, {
    resumable: false,
    contentType: 'image/png',
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const bucketName = adminBucket.name;
  return makeFirebaseDownloadUrl(bucketName, storagePath, token);
}

// ---------- route ----------

export async function POST(req: NextRequest) {
  const db = adminDb;
  // 0) Auth (n8n shared secret)
  const secret = req.headers.get('x-n8n-secret');
  if (
    !process.env.N8N_SHARED_SECRET ||
    secret !== process.env.N8N_SHARED_SECRET
  ) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const requestId = randomUUID();

  // Hoist so catch() can include them even if parsing fails
  let runId: string = requestId;
  let rowId: string | number | null = null;

  // Firestore job doc ref stored here once created

  let jobRef: any = null;

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

    const isMock = parseBool(body.mock) || parseBool(process.env.MOCK_MODE);

    log('create_asset.request', {
      requestId,
      runId,
      rowId,
      count,
      isMock,
      hasStyle: !!style,
    });

    if (!promptRaw) {
      log('create_asset.bad_request', {
        requestId,
        runId,
        rowId,
        reason: 'Missing prompt',
      });
      return NextResponse.json(
        { ok: false, requestId, runId, rowId, error: 'Missing prompt' },
        { status: 400 },
      );
    }

    // 1) Create job doc early (jobId always exists)
    jobRef = await db.collection('jobs').add({
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

    // 2) MOCK short-circuit (no OpenAI, no Storage uploads)
    if (isMock) {
      const origin = getOrigin(req);
      const placeholderUrl = process.env.MOCK_IMAGE_URL || `${origin}/mock.png`;

      const createdAssets: Array<{ assetId: string; imageUrl: string }> = [];

      for (let i = 0; i < count; i++) {
        const assetDoc = await db.collection('assets').add({
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

        createdAssets.push({ assetId: assetDoc.id, imageUrl: placeholderUrl });
      }

      await jobRef.update({
        status: 'mock_done',
        assets: createdAssets,
        generatedCount: createdAssets.length,
        finishedAt: FieldValue.serverTimestamp(),
        ms: Date.now() - startedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      log('create_asset.mock_done', {
        requestId,
        runId,
        rowId,
        jobId: jobRef.id,
        count: createdAssets.length,
      });

      return NextResponse.json(
        {
          ok: true,
          requestId,
          runId,
          rowId,
          jobId: jobRef.id,
          mock: true,
          count: createdAssets.length,
          assets: createdAssets,
        },
        { status: 200 },
      );
    }

    // 3) Daily cap (America/New_York boundary by default)
    const DAILY_CAP = Number(process.env.DAILY_CAP ?? 10);
    const DAILY_TZ = process.env.DAILY_TZ || 'America/New_York';

    const { used: usedToday, dayStart } = await getUsedTodayCount(DAILY_TZ);

    if (usedToday + count > DAILY_CAP) {
      log('create_asset.rate_limited', {
        requestId,
        runId,
        rowId,
        jobId: jobRef.id,
        usedToday,
        DAILY_CAP,
        dayStart: dayStart.toISOString(),
      });

      await jobRef.update({
        status: 'error',
        error: 'Daily limit reached',
        usedToday,
        DAILY_CAP,
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
          error: 'Daily limit reached',
          usedToday,
          DAILY_CAP,
        },
        { status: 429 },
      );
    }

    // 4) OpenAI image generation
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const finalPrompt = style ? `${promptRaw}\n\nStyle: ${style}` : promptRaw;

    const t0 = Date.now();
    const gen = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: finalPrompt,
      n: count,
      size: '1024x1024',
    });

    log('create_asset.generated', {
      requestId,
      runId,
      rowId,
      jobId: jobRef.id,
      ms: Date.now() - t0,
    });

    const outputs = Array.isArray(gen.data) ? gen.data : [];
    const createdAssets: Array<{ assetId: string; imageUrl: string }> = [];

    // 5) Upload + write asset docs
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i];

      let png: Buffer | null = null;

      // Prefer b64_json (cheapest path)

      if ((out as any)?.b64_json) {
        png = Buffer.from((out as any).b64_json, 'base64');
      } else if ((out as any)?.url) {
        // fallback: fetch remote URL if provided

        const resp = await fetch((out as any).url);
        if (!resp.ok) {
          log('create_asset.fetch_failed', {
            requestId,
            runId,
            rowId,
            jobId: jobRef.id,

            url: (out as any).url,
            status: resp.status,
          });
          continue;
        }
        const ab = await resp.arrayBuffer();
        png = Buffer.from(ab);
      }

      if (!png) continue;

      const safeRow = (rowId ?? 'row').toString();
      const storagePath = `assets/${safeRow}-${requestId}-${Date.now()}-${
        i + 1
      }.png`;
      const imageUrl = await uploadPngAndGetUrl(storagePath, png);

      const assetDoc = await db.collection('assets').add({
        title,
        prompt: promptRaw,
        niche,
        style,
        imageUrl,
        thumbUrl: imageUrl, // step 3 can replace this later with a real thumbnail
        storagePath,
        source: 'n8n',
        runId,
        rowId: rowId?.toString?.() ?? rowId,
        jobId: jobRef.id,
        published: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      createdAssets.push({ assetId: assetDoc.id, imageUrl });
    }

    if (createdAssets.length === 0) {
      await jobRef.update({
        status: 'error',
        error: 'No images generated',
        generatedCount: 0,
        ms: Date.now() - startedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      log('create_asset.error', {
        requestId,
        runId,
        rowId,
        jobId: jobRef.id,
        message: 'No images generated',
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
      assets: createdAssets,
      generatedCount: createdAssets.length,
      finishedAt: FieldValue.serverTimestamp(),
      ms: Date.now() - startedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    log('create_asset.success', {
      requestId,
      runId,
      rowId,
      jobId: jobRef.id,
      count: createdAssets.length,
      ms: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        runId,
        rowId,
        jobId: jobRef.id,
        count: createdAssets.length,
        assets: createdAssets,
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
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
