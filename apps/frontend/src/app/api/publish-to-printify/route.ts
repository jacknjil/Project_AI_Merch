import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { crispUpscale, removeBackground, needsBackgroundRemoval } from '@/lib/recraft';
import {
  uploadImageToPrintify,
  createPrintifyProduct,
  publishPrintifyProduct,
  getPrintifyMockupUrl,
} from '@/lib/printify';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assetId, imageUrl, title, productCategory, niche } = body ?? {};

    if (!assetId || !imageUrl || !title || !productCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: assetId, imageUrl, title, productCategory' },
        { status: 400 },
      );
    }

    let printUrl = String(imageUrl);
    const isApparel = needsBackgroundRemoval(String(productCategory));

    if (isApparel) {
      // Remove background first on the original (~1024px) — upscaled images exceed Recraft's size limit
      try {
        printUrl = await removeBackground(printUrl);
      } catch (bgErr) {
        console.warn('removeBackground failed, using image with background:', bgErr instanceof Error ? bgErr.message : bgErr);
      }
      // Then upscale the bg-removed image for print quality
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using current URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
    } else {
      // Non-apparel (drinkware): upscale only — background is part of the design
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using original URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
    }

    // 3. Upload to Printify image library
    const fileName = `${assetId}-print.png`;
    const uploaded = await uploadImageToPrintify(printUrl, fileName);

    // 4. Create Printify product
    const description = niche
      ? `${title} — ${niche} themed print-on-demand design.`
      : `${title} — original AI-generated design.`;

    const product = await createPrintifyProduct({
      title: String(title),
      description,
      productCategory: String(productCategory),
      printifyImageId: uploaded.id,
      tags: niche ? [String(niche), 'ai-merch'] : ['ai-merch'],
    });

    // 5. Publish to connected sales channel — non-fatal if no channel connected
    let printifyStatus = 'created';
    let publishWarning: string | undefined;
    try {
      await publishPrintifyProduct(product.id);
      printifyStatus = 'published';
    } catch (publishErr) {
      publishWarning = publishErr instanceof Error ? publishErr.message : String(publishErr);
      console.warn('Printify publish skipped:', publishWarning);
    }

    // 6. Fetch Printify mockup URL (non-fatal)
    const mockupUrl = await getPrintifyMockupUrl(product.id).catch(() => null);

    // 7. Update Firestore asset
    await adminDb.collection('assets').doc(String(assetId)).update({
      printifyProductId: product.id,
      printifyStatus,
      ...(mockupUrl ? { mockupUrl } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      printifyProductId: product.id,
      printifyStatus,
      ...(publishWarning ? { publishWarning } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('publish-to-printify error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
