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

// Print area dimensions per product category (pixels at 300 DPI)
const PRINT_AREA: Record<string, { width: number; height: number }> = {
  shirt:  { width: 3600, height: 4800 },
  hoodie: { width: 3600, height: 4800 },
  tote:   { width: 4500, height: 4500 },
  mug:    { width: 2550, height: 1110 },
  cup:    { width: 2790, height: 1200 },
};

// Printify blueprint IDs for the most common print partners
export const BLUEPRINT_IDS: Record<string, number> = {
  shirt:  12,   // Gildan 64000 Softstyle
  hoodie: 92,   // Gildan 18500
  tote:   77,   // Gildan Heavy Tote
  mug:    31,   // Orca Coating 11oz mug
  cup:    1071, // Orca Coating 15oz mug
};

// Default print provider per blueprint (Printify Choice = 99)
export const PRINT_PROVIDER_IDS: Record<string, number> = {
  shirt:  99,
  hoodie: 99,
  tote:   99,
  mug:    27,
  cup:    27,
};

// Black S/M/L/XL variant IDs per category (Printify Choice, blueprint-specific)
// Fetched from /v1/catalog/blueprints/{id}/print_providers/{prov}/variants.json
const VARIANT_IDS: Record<string, number[]> = {
  shirt:  [18100, 18101, 18102, 18103], // confirmed: blueprint 12, provider 99, Black S/M/L/XL
  hoodie: [], // TODO: blueprint 92, provider 99, Black S/M/L/XL
  tote:   [], // TODO: blueprint 77, provider 99, enabled variants
  mug:    [], // TODO: blueprint 31, provider 27, enabled variants
  cup:    [], // TODO: blueprint 1071, provider 27, enabled variants
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

  const data = await res.json() as { variants: { id: number; title: string; is_enabled: boolean }[] };

  const isApparel = ['shirt', 'hoodie'].includes(category);
  let ids: number[];

  if (isApparel) {
    const targets = ['Black / S', 'Black / M', 'Black / L', 'Black / XL'];
    ids = targets
      .map(t => data.variants.find(v => v.title === t && v.is_enabled)?.id)
      .filter((id): id is number => id !== undefined);
  } else {
    ids = data.variants.filter(v => v.is_enabled).slice(0, 4).map(v => v.id);
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

export interface PrintifyProduct {
  id: string;
  title: string;
  external?: { id: string; handle: string };
}

export async function uploadImageToPrintify(
  imageUrl: string,
  fileName: string,
): Promise<PrintifyImageUpload> {
  const { apiKey } = getCredentials();

  // Fetch image and convert to PNG — Printify rejects WebP
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for Printify upload: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();
  const pngBuffer = await sharp(Buffer.from(imgBytes)).png().toBuffer();
  const base64 = pngBuffer.toString('base64');
  const safeFileName = fileName.replace(/\.[^.]+$/, '') + '.png';

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

export async function getPrintifyMockupUrl(productId: string): Promise<string | null> {
  const { apiKey, shopId } = getCredentials();

  const res = await fetch(
    `${PRINTIFY_BASE}/shops/${shopId}/products/${productId}.json`,
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
  );

  if (!res.ok) return null;

  const data = await res.json() as { images?: { src: string; is_default?: boolean }[] };
  const images = data.images ?? [];
  const defaultImg = images.find((i) => i.is_default) ?? images[0];
  return defaultImg?.src ?? null;
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
