import sharp from 'sharp';

const PRINTIFY_BASE = 'https://api.printify.com/v1';

function getCredentials() {
  const apiKey = process.env.PRINTIFY_API_KEY;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!apiKey) throw new Error('PRINTIFY_API_KEY is not set');
  if (!shopId) throw new Error('PRINTIFY_SHOP_ID is not set');
  return { apiKey, shopId };
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// Printify blueprint IDs — verified against live catalog 2026-06-25
// hat added 2026-08-13, verified against live catalog same date
export const BLUEPRINT_IDS: Record<string, number> = {
  shirt:  12,   // Gildan 64000 Softstyle
  hoodie: 92,   // Gildan 18500
  tote:   553,  // Cotton Tote Bag (Fulfill Engine)
  mug:    68,   // Mug 11oz (SPOKE Custom Products)
  cup:    425,  // Mug 15oz (SPOKE Custom Products)
  hat:    1446, // Snapback Trucker Cap (Yupoong 6606)
};

// Print provider per blueprint — verified against live catalog 2026-06-25
// hat added 2026-08-13, verified against live catalog same date
export const PRINT_PROVIDER_IDS: Record<string, number> = {
  shirt:  99,  // Printify Choice
  hoodie: 99,  // Printify Choice
  tote:   217, // Fulfill Engine
  mug:    1,   // SPOKE Custom Products
  cup:    1,   // SPOKE Custom Products
  hat:    99,  // Printify Choice
};

// Blueprint id -> category, for products not created through this app's
// own publish pipeline. Extends the app-default blueprints above with
// blueprints discovered on Printify's own dashboard (audit: 2026-07-05).
export const BLUEPRINT_CATEGORY_MAP: Record<number, string> = {
  12: 'shirt',    // app default
  92: 'hoodie',   // app default
  553: 'tote',    // app default
  68: 'mug',      // app default
  425: 'cup',     // app default
  1446: 'hat',    // app default
  400: 'sticker', // Kiss-Cut Stickers
  1313: 'tote',   // Cotton Canvas Tote Bag
  77: 'hoodie',   // Unisex Heavy Blend Hooded Sweatshirt
  706: 'shirt',   // Unisex Garment-Dyed T-shirt
};

export function suggestCategoryForBlueprint(blueprintId: number): string | undefined {
  return BLUEPRINT_CATEGORY_MAP[blueprintId];
}

export interface PrintifyProductSummary {
  id: string;
  title: string;
  blueprint_id: number;
  print_provider_id: number;
  images: { src: string; is_default?: boolean }[];
}

interface PrintifyProductsPage {
  data: PrintifyProductSummary[];
  current_page: number;
  last_page: number;
}

const MAX_PRODUCT_PAGES = 50;

export async function fetchAllPrintifyProducts(
  fetchPage: (page: number) => Promise<PrintifyProductsPage>,
): Promise<PrintifyProductSummary[]> {
  const all: PrintifyProductSummary[] = [];
  let page = 1;
  while (page <= MAX_PRODUCT_PAGES) {
    const result = await fetchPage(page);
    all.push(...result.data);
    if (page >= result.last_page) break;
    page += 1;
  }
  return all;
}

export function filterUnmatchedProducts(
  products: PrintifyProductSummary[],
  trackedIds: Set<string>,
  ignoredIds: Set<string>,
): PrintifyProductSummary[] {
  return products.filter((p) => !trackedIds.has(p.id) && !ignoredIds.has(p.id));
}

export interface AssetProductRef {
  id: string;
  title: string;
  printifyProductId?: string;
  printifyStatus?: string;
  mockupUrl?: string | null;
}

export function findOrphanedAssets(
  assets: AssetProductRef[],
  livePrintifyProductIds: Set<string>,
): AssetProductRef[] {
  return assets.filter(
    (a) =>
      !!a.printifyProductId &&
      a.printifyStatus !== 'archived' &&
      !livePrintifyProductIds.has(a.printifyProductId),
  );
}

export function mapPrintifyImages(
  images: { src: string; is_default?: boolean }[],
): PrintifyMockupImage[] {
  let altCount = 0;
  return images.map((img) => {
    const isDefault = !!img.is_default;
    return { src: img.src, label: isDefault ? 'Front' : `Alternate ${++altCount}`, isDefault };
  });
}

// Fallback variant IDs — fetched from live catalog 2026-06-25
// Used when the catalog API is unavailable at publish time
const VARIANT_IDS: Record<string, number[]> = {
  shirt:  [18100, 18101, 18102, 18103], // blueprint 12  / provider 99:  Black S/M/L/XL
  hoodie: [34079, 34093, 34107, 34121], // blueprint 92  / provider 99:  Jet Black S/M/L/XL
  tote:   [70603],                       // blueprint 553 / provider 217: One size / Black
  mug:    [33719],                       // blueprint 68  / provider 1:   11oz
  cup:    [62014],                       // blueprint 425 / provider 1:   15oz
  hat:    [105362],                      // blueprint 1446 / provider 99: Black / One size
};

const variantCache = new Map<string, number[]>();

export async function fetchVariantIds(
  blueprintId: number,
  printProviderId: number,
  category: string,
): Promise<number[]> {
  const cacheKey = `${blueprintId}-${printProviderId}`;
  if (variantCache.has(cacheKey)) return variantCache.get(cacheKey)!;

  const { apiKey } = getCredentials();
  const res = await fetch(
    `${PRINTIFY_BASE}/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (!res.ok) {
    console.warn(`fetchVariantIds: catalog API returned ${res.status}, using fallback`);
    return VARIANT_IDS[category] ?? VARIANT_IDS['shirt'];
  }

  const data = await res.json() as { variants: { id: number; title: string }[] };

  const isApparel = ['shirt', 'hoodie'].includes(category);
  let ids: number[];

  if (isApparel) {
    // Shirts use "Black", hoodies use "Jet Black" — check both
    const targets = ['Black / S', 'Black / M', 'Black / L', 'Black / XL',
                     'Jet Black / S', 'Jet Black / M', 'Jet Black / L', 'Jet Black / XL'];
    ids = targets
      .map(t => data.variants.find(v => v.title === t)?.id)
      .filter((id): id is number => id !== undefined)
      .slice(0, 4);
  } else if (category === 'hat') {
    // Hats are one-size — pick the solid Black variant explicitly rather
    // than trusting catalog ordering to put it first.
    const blackId = data.variants.find(v => v.title === 'Black / One size')?.id;
    ids = blackId !== undefined ? [blackId] : data.variants.slice(0, 1).map(v => v.id);
  } else {
    // Drinkware and totes: take first available variant(s)
    ids = data.variants.slice(0, 4).map(v => v.id);
  }

  if (ids.length === 0) {
    console.warn(`fetchVariantIds: no matching variants for blueprint ${blueprintId}, using fallback`);
    return VARIANT_IDS[category] ?? VARIANT_IDS['shirt'];
  }

  variantCache.set(cacheKey, ids);
  return ids;
}

export interface PrintifyImageUpload {
  id: string;
  file_name: string;
  preview_url: string;
}

export function pickUploadFormat(hasAlpha: boolean): 'png' | 'jpeg' {
  return hasAlpha ? 'png' : 'jpeg';
}

export async function upscalePreservingAlpha(buffer: Buffer, targetSize = 4096): Promise<Buffer> {
  return sharp(buffer)
    .resize(targetSize, targetSize, { fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

export interface PrintifyPlaceholder {
  position: string;
  images: { src: string }[];
}

export interface PrintifyPrintArea {
  placeholders: PrintifyPlaceholder[];
}

export function findFrontArtworkSrc(printAreas: PrintifyPrintArea[]): string | null {
  const front = printAreas[0]?.placeholders?.find((ph) => ph.position === 'front');
  const src = front?.images?.[0]?.src;
  return src ? src : null;
}

export async function hasAlphaChannel(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata();
  return !!meta.hasAlpha;
}

// Used by the printify-import scan to flag artwork that can never render
// transparently on dark colors (see docs/superpowers/... alpha-fix memory).
export async function checkFrontArtworkAlpha(productId: string): Promise<boolean | null> {
  const { apiKey, shopId } = getCredentials();
  const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/products/${productId}.json`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;

  const data = await res.json() as { print_areas?: PrintifyPrintArea[] };
  const src = findFrontArtworkSrc(data.print_areas ?? []);
  if (!src) return null;

  const imgRes = await fetch(src);
  if (!imgRes.ok) return null;
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return hasAlphaChannel(buffer);
}

export interface PrintifyProduct {
  id: string;
  title: string;
  external?: { id: string; handle: string };
}

export async function uploadBufferToPrintify(
  buffer: Buffer,
  fileName: string,
): Promise<PrintifyImageUpload> {
  const { apiKey } = getCredentials();

  const meta = await sharp(buffer).metadata();
  const format = pickUploadFormat(!!meta.hasAlpha);

  const encoded = format === 'png'
    ? await sharp(buffer).png().toBuffer()
    : await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
  const base64 = encoded.toString('base64');
  const safeFileName = fileName.replace(/\.[^.]+$/, '') + (format === 'png' ? '.png' : '.jpg');

  const res = await fetch(`${PRINTIFY_BASE}/uploads/images.json`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ file_name: safeFileName, contents: base64 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify image upload error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PrintifyImageUpload>;
}

export async function uploadImageToPrintify(
  imageUrl: string,
  fileName: string,
): Promise<PrintifyImageUpload> {
  // Fetch server-side — Printify's servers are blocked from img.recraft.ai (CDN bot protection).
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for Printify upload: ${imgRes.status}`);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  return uploadBufferToPrintify(imgBytes, fileName);
}

export interface CreateProductOptions {
  title: string;
  description: string;
  productCategory: string;
  printifyImageId: string;
  tags?: string[];
}

export async function createPrintifyProduct(
  options: CreateProductOptions,
): Promise<PrintifyProduct> {
  const { apiKey, shopId } = getCredentials();

  const category = options.productCategory in BLUEPRINT_IDS
    ? options.productCategory
    : 'shirt';

  const blueprintId = BLUEPRINT_IDS[category];
  const printProviderId = PRINT_PROVIDER_IDS[category];

  const variantIds = await fetchVariantIds(blueprintId, printProviderId, category);
  const variants = variantIds.map(id => ({ id, price: 2500, is_enabled: true }));

  const body = {
    title: options.title,
    description: options.description,
    blueprint_id: blueprintId,
    print_provider_id: printProviderId,
    variants,
    print_areas: [
      {
        variant_ids: variantIds,
        placeholders: [
          {
            position: 'front',
            images: [
              {
                id: options.printifyImageId,
                x: 0.5,
                y: 0.5,
                scale: 1,
                angle: 0,
              },
            ],
          },
        ],
      },
    ],
    tags: options.tags ?? [],
  };

  const res = await fetch(`${PRINTIFY_BASE}/shops/${shopId}/products.json`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify create product error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PrintifyProduct>;
}

export interface PrintifyMockupImage {
  src: string;
  label: string;
  isDefault: boolean;
}

export async function getPrintifyMockupImages(
  productId: string,
  { retries = 5, initialDelayMs = 5000 }: { retries?: number; initialDelayMs?: number } = {},
): Promise<PrintifyMockupImage[]> {
  const { apiKey, shopId } = getCredentials();

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, initialDelayMs * attempt));
    }

    const res = await fetch(
      `${PRINTIFY_BASE}/shops/${shopId}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );

    if (!res.ok) return [];

    const data = await res.json() as { images?: { src: string; is_default?: boolean }[] };
    const images = data.images ?? [];

    if (images.length > 0) {
      return mapPrintifyImages(images);
    }
  }

  return [];
}

export async function publishPrintifyProduct(productId: string): Promise<void> {
  const { apiKey, shopId } = getCredentials();

  const res = await fetch(
    `${PRINTIFY_BASE}/shops/${shopId}/products/${productId}/publish.json`,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printify publish error ${res.status}: ${text}`);
  }
}
