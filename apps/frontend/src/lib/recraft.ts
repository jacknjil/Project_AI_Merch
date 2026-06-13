const RECRAFT_BASE = 'https://external.api.recraft.ai/v1';

const APPAREL = new Set(['shirt', 'hoodie', 'tote']);

type StyleSpec = { style: string; substyle?: string };

// Apparel: vector_illustration family — clean edges, scales, print-safe
const APPAREL_STYLE: Record<string, StyleSpec> = {
  'vintage-badge':    { style: 'vector_illustration', substyle: 'colored_stencil' },
  'watercolor':       { style: 'digital_illustration', substyle: 'hand_drawn' },
  'flat-vector':      { style: 'vector_illustration', substyle: 'bold_stroke' },
  'typography-humor': { style: 'vector_illustration', substyle: 'editorial' },
  'kawaii':           { style: 'digital_illustration', substyle: 'child_book' },
  'cartoon-humor':    { style: 'digital_illustration', substyle: 'hard_comics' },
};

// Drinkware: digital_illustration family — richer color, detail survives dye-sub
const DRINKWARE_STYLE: Record<string, StyleSpec> = {
  'vintage-badge':    { style: 'digital_illustration' },
  'watercolor':       { style: 'digital_illustration', substyle: 'hand_drawn' },
  'flat-vector':      { style: 'vector_illustration', substyle: 'bold_stroke' },
  'typography-humor': { style: 'digital_illustration', substyle: 'hard_comics' },
  'kawaii':           { style: 'digital_illustration', substyle: 'child_book' },
  'cartoon-humor':    { style: 'digital_illustration', substyle: 'hard_comics' },
};

const DEFAULT_STYLE: StyleSpec = { style: 'digital_illustration' };

interface RecraftImage {
  url?: string;
  b64_json?: string;
}

export interface RecraftResponse {
  data: RecraftImage[];
}

interface GenerateOptions {
  prompt: string;
  styleTag?: string;
  productCategory?: string;
  n?: number;
  size?: string;
}

export function needsBackgroundRemoval(productCategory: string | undefined): boolean {
  return APPAREL.has(productCategory ?? '');
}

export function resolveRecraftStyle(styleTag: string | undefined, productCategory: string | undefined): StyleSpec {
  const map = APPAREL.has(productCategory ?? '') ? APPAREL_STYLE : DRINKWARE_STYLE;
  return map[styleTag ?? ''] ?? DEFAULT_STYLE;
}

export async function recraftGenerate(options: GenerateOptions): Promise<RecraftResponse> {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new Error('RECRAFT_API_KEY is not set');

  const { style, substyle } = resolveRecraftStyle(options.styleTag, options.productCategory);

  const body: Record<string, unknown> = {
    model: 'recraftv3',
    prompt: options.prompt,
    style,
    n: options.n ?? 1,
    size: options.size ?? '1024x1024',
    response_format: 'url',
  };
  if (substyle) body.substyle = substyle;

  const res = await fetch(`${RECRAFT_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recraft generate error ${res.status}: ${text}`);
  }

  return res.json() as Promise<RecraftResponse>;
}

export async function removeBackground(imageUrl: string): Promise<string> {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new Error('RECRAFT_API_KEY is not set');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch image for bg removal: ${imgRes.status}`);
  const imgBytes = await imgRes.arrayBuffer();

  const form = new FormData();
  form.append('file', new Blob([imgBytes], { type: 'image/png' }), 'image.png');
  form.append('response_format', 'url');

  const res = await fetch(`${RECRAFT_BASE}/images/removeBackground`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recraft removeBackground error ${res.status}: ${text}`);
  }

  const json = await res.json() as { data?: RecraftImage[] };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error('Recraft removeBackground returned no URL');
  return url;
}
