// src/lib/firebaseAdmin.ts
import 'server-only';

import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ServiceAccount } from 'firebase-admin/app';
import type { Bucket } from '@google-cloud/storage';

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  if (raw) {
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. Tip: use FIREBASE_SERVICE_ACCOUNT_B64 to avoid escaping issues.',
      );
    }
  }

  if (rawB64) {
    try {
      const decoded = Buffer.from(rawB64, 'base64').toString('utf8');
      return JSON.parse(decoded) as ServiceAccount;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is set but is invalid.');
    }
  }

  throw new Error(
    'Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_B64 (or use GOOGLE_APPLICATION_CREDENTIALS with ADC).',
  );
}

let _app: App | null = null;
let _db: Firestore | null = null;
let _bucket: Bucket | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0] as App;
    return _app;
  }

  const hasInlineCreds =
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    !!process.env.FIREBASE_SERVICE_ACCOUNT_B64;

  _app = initializeApp(
    hasInlineCreds
      ? {
          credential: cert(parseServiceAccount()),
          // storageBucket is optional here; bucket is resolved lazily below
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        }
      : {
          credential: applicationDefault(),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        },
  );

  return _app;
}

function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getAdminApp());
  return _db;
}

function getBucket(): Bucket {
  if (_bucket) return _bucket;

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      'Missing FIREBASE_STORAGE_BUCKET (e.g. your-project-id.firebasestorage.app)',
    );
  }

  _bucket = getStorage(getAdminApp()).bucket(bucketName);
  return _bucket;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bindMaybeFn<T extends object>(target: T, value: any) {
  return typeof value === 'function' ? value.bind(target) : value;
}

// ✅ VALUE-LIKE exports (but lazy)
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_t, prop) {
    const db = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return bindMaybeFn(db, (db as any)[prop]);
  },
});

export const adminBucket: Bucket = new Proxy({} as Bucket, {
  get(_t, prop) {
    const b = getBucket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return bindMaybeFn(b, (b as any)[prop]);
  },
});

export { FieldValue };
