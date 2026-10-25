import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { shouldPublishToChannel } from '@/lib/publishGuard';
import { DEFAULT_PRODUCT_CATEGORY } from '@/lib/recraft';
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

// Firestore doc ids used for assets; rejects path separators and anything exotic.
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { assetId } = body ?? {};

    if (typeof assetId !== 'string' || !ASSET_ID_PATTERN.test(assetId)) {
      return NextResponse.json({ error: 'Missing or invalid assetId' }, { status: 400 });
    }

    // Read the asset up front so an unknown id fails before any upload or product creation,
    // and so the publish guard can see the approval flag. Image, title and category come from
    // the saved asset, never the request body, so a caller can't point the server at an
    // arbitrary URL or publish a mismatched image under an approved asset's id.
    const assetRef = adminDb.collection('assets').doc(assetId);
    const assetSnap = await assetRef.get();
    if (!assetSnap.exists) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const asset = assetSnap.data() ?? {};
    const imageUrl: unknown = asset.imageUrl;
    const title: unknown = asset.title;
    const productCategory = String(asset.productCategory ?? DEFAULT_PRODUCT_CATEGORY);
    const niche: unknown = asset.niche;

    if (typeof imageUrl !== 'string' || !imageUrl || typeof title !== 'string' || !title) {
      return NextResponse.json({ error: 'Asset is missing imageUrl or title' }, { status: 400 });
    }

    // A second run would create a duplicate Printify product and overwrite the stored id.
    if (asset.printifyProductId && (asset.printifyStatus === 'created' || asset.printifyStatus === 'published')) {
      return NextResponse.json(
        { error: 'Asset already has a Printify product', printifyProductId: asset.printifyProductId },
        { status: 409 },
      );
    }

    const publishDecision = shouldPublishToChannel(
      { approvedForPublish: asset.approvedForPublish },
      process.env.PRINTIFY_PUBLISH_ENABLED,
    );

    let printUrl = imageUrl;
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

    // 5. Publish to connected sales channel (Etsy) only when the guard allows it.
    // A blocked product stays a hidden Printify draft — nothing reaches Etsy.
    // Publish failures are non-fatal.
    let printifyStatus = 'created';
    let publishWarning: string | undefined;
    let publishBlockedReason: string | undefined;
    if (publishDecision.publish) {
      try {
        await publishPrintifyProduct(product.id);
        printifyStatus = 'published';
      } catch (publishErr) {
        publishWarning = publishErr instanceof Error ? publishErr.message : String(publishErr);
        console.warn('Printify publish skipped:', publishWarning);
      }
    } else {
      publishBlockedReason = publishDecision.reason;
    }

    // 6. Fetch Printify mockup images (non-fatal)
    const mockupImages = await getPrintifyMockupImages(product.id).catch(() => []);
    const mockupUrl = mockupImages.find((img) => img.isDefault)?.src ?? mockupImages[0]?.src ?? null;

    // 7. Update Firestore asset
    await assetRef.update({
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
      ...(publishBlockedReason ? { publishBlockedReason } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('publish-to-printify error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
