import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  fetchAllPrintifyProducts,
  filterUnmatchedProducts,
  suggestCategoryForBlueprint,
  mapPrintifyImages,
  type PrintifyProductSummary,
} from '@/lib/printify';

export const runtime = 'nodejs';

const PRINTIFY_BASE = 'https://api.printify.com/v1';

export interface PreviewItem {
  printifyProductId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  suggestedCategory?: string;
  mockupImages: { src: string; label: string; isDefault: boolean }[];
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

    const trackedSnap = await adminDb.collection('assets').select('printifyProductId').get();
    const trackedIds = new Set(
      trackedSnap.docs
        .map((d) => d.get('printifyProductId') as string | undefined)
        .filter((id): id is string => !!id),
    );

    const ignoredSnap = await adminDb.collection('printifyImportIgnores').get();
    const ignoredIds = new Set(ignoredSnap.docs.map((d) => d.id));

    const unmatched = filterUnmatchedProducts(products, trackedIds, ignoredIds);

    const items: PreviewItem[] = unmatched.map((p) => ({
      printifyProductId: p.id,
      title: p.title,
      blueprintId: p.blueprint_id,
      printProviderId: p.print_provider_id,
      suggestedCategory: suggestCategoryForBlueprint(p.blueprint_id),
      mockupImages: mapPrintifyImages(p.images ?? []),
    }));

    return NextResponse.json({ products: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('printify-import/preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
