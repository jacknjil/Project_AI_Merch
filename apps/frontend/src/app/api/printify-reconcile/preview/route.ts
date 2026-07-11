import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  fetchAllPrintifyProducts,
  findOrphanedAssets,
  type PrintifyProductSummary,
  type AssetProductRef,
} from '@/lib/printify';

export const runtime = 'nodejs';

const PRINTIFY_BASE = 'https://api.printify.com/v1';

export interface ReconcilePreviewItem {
  assetId: string;
  title: string;
  printifyProductId: string;
  mockupUrl: string | null;
}

export async function GET() {
  try {
    const apiKey = process.env.PRINTIFY_API_KEY;
    const shopId = process.env.PRINTIFY_SHOP_ID;
    if (!apiKey || !shopId) {
      return NextResponse.json(
        { error: 'PRINTIFY_API_KEY / PRINTIFY_SHOP_ID are not set' },
        { status: 500 },
      );
    }

    const products = await fetchAllPrintifyProducts(async (page) => {
      const res = await fetch(
        `${PRINTIFY_BASE}/shops/${shopId}/products.json?page=${page}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!res.ok) {
        throw new Error(`Printify products fetch failed: ${res.status}`);
      }
      return res.json() as Promise<{
        data: PrintifyProductSummary[];
        current_page: number;
        last_page: number;
      }>;
    });
    const livePrintifyProductIds = new Set(products.map((p) => p.id));

    const assetsSnap = await adminDb
      .collection('assets')
      .select('title', 'printifyProductId', 'printifyStatus', 'mockupUrl')
      .get();

    const assets: AssetProductRef[] = assetsSnap.docs.map((d) => ({
      id: d.id,
      title: (d.get('title') as string | undefined) ?? '',
      printifyProductId: d.get('printifyProductId') as string | undefined,
      printifyStatus: d.get('printifyStatus') as string | undefined,
      mockupUrl: (d.get('mockupUrl') as string | undefined) ?? null,
    }));

    const orphans = findOrphanedAssets(assets, livePrintifyProductIds);

    const items: ReconcilePreviewItem[] = orphans.map((a) => ({
      assetId: a.id,
      title: a.title,
      printifyProductId: a.printifyProductId as string,
      mockupUrl: a.mockupUrl ?? null,
    }));

    return NextResponse.json({ orphans: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-reconcile/preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
