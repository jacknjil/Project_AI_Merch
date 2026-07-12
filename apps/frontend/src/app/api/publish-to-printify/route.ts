import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { crispUpscale, removeBackground, needsBackgroundRemoval } from '@/lib/recraft';
import {
  uploadImageToPrintify,
  uploadBufferToPrintify,
  upscalePreservingAlpha,
  createPrintifyProduct,
  publishPrintifyProduct,
  getPrintifyMockupImages,
  type PrintifyImageUpload,
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
    const fileName = `${assetId}-print.png`;
    let uploaded: PrintifyImageUpload;

    if (isApparel) {
      // Remove background first on the original (~1024px) — upscaled images exceed Recraft's size limit.
      // A failure here means the Printify product would be created with the background still attached,
      // so this blocks the publish instead of silently continuing.
      try {
        printUrl = await removeBackground(printUrl);
      } catch (bgErr) {
        const message = bgErr instanceof Error ? bgErr.message : String(bgErr);
        console.error('publish-to-printify: removeBackground failed, blocking publish:', message);
        return NextResponse.json(
          { error: `Background removal failed: ${message}` },
          { status: 502 },
        );
      }

      // Upscale locally, not via Recraft's crispUpscale — crispUpscale unconditionally
      // flattens transparency to a solid white background before upscaling, which
      // destroys the transparency removeBackground just produced (confirmed via live
      // testing 2026-07-12: WEBP hasAlpha:true -> WEBP hasAlpha:false, 47% opaque white).
      // A failure here blocks the publish for the same reason removeBackground does:
      // a silent fallback would ship a defective or lower-resolution print file.
      try {
        const bgRemovedRes = await fetch(printUrl);
        if (!bgRemovedRes.ok) {
          throw new Error(`Failed to fetch background-removed image: ${bgRemovedRes.status}`);
        }
        const bgRemovedBuffer = Buffer.from(await bgRemovedRes.arrayBuffer());
        const upscaledBuffer = await upscalePreservingAlpha(bgRemovedBuffer);
        uploaded = await uploadBufferToPrintify(upscaledBuffer, fileName);
      } catch (upscaleErr) {
        const message = upscaleErr instanceof Error ? upscaleErr.message : String(upscaleErr);
        console.error('publish-to-printify: upscale/upload failed, blocking publish:', message);
        return NextResponse.json(
          { error: `Image upscale failed: ${message}` },
          { status: 502 },
        );
      }
    } else {
      // Non-apparel (drinkware): upscale only — background is part of the design,
      // no transparency required, so Recraft's crispUpscale remains correct here.
      try {
        printUrl = await crispUpscale(printUrl);
      } catch (upscaleErr) {
        console.warn('crispUpscale failed, using original URL:', upscaleErr instanceof Error ? upscaleErr.message : upscaleErr);
      }
      uploaded = await uploadImageToPrintify(printUrl, fileName);
    }

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

    // 6. Fetch Printify mockup images (non-fatal)
    const mockupImages = await getPrintifyMockupImages(product.id).catch(() => []);
    const mockupUrl = mockupImages.find((img) => img.isDefault)?.src ?? mockupImages[0]?.src ?? null;

    // 7. Update Firestore asset
    await adminDb.collection('assets').doc(String(assetId)).update({
      printifyProductId: product.id,
      printifyStatus,
      ...(mockupUrl ? { mockupUrl } : {}),
      ...(mockupImages.length > 0 ? { mockupImages } : {}),
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
