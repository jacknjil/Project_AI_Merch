import { openai } from './openai';

export type FontCategory =
  | 'bold-display'
  | 'elegant-serif'
  | 'playful-script'
  | 'vintage-distressed'
  | 'minimal-sans';

export const FONT_CATEGORIES: FontCategory[] = [
  'bold-display',
  'elegant-serif',
  'playful-script',
  'vintage-distressed',
  'minimal-sans',
];

export type ArtShape = 'circular' | 'rectangular';

export const ART_SHAPES: ArtShape[] = ['circular', 'rectangular'];

const DEFAULT_CATEGORY: FontCategory = 'bold-display';
const DEFAULT_SHAPE: ArtShape = 'rectangular';

export interface StyleAnalysisContext {
  colorPalette?: string;
  styleTag?: string;
}

export interface ArtStyleAnalysis {
  fontCategory: FontCategory;
  shape: ArtShape;
}

function isFontCategory(value: unknown): value is FontCategory {
  return typeof value === 'string' && (FONT_CATEGORIES as string[]).includes(value);
}

function isArtShape(value: unknown): value is ArtShape {
  return typeof value === 'string' && (ART_SHAPES as string[]).includes(value);
}

export async function analyzeArtStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ArtStyleAnalysis> {
  try {
    const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    const promptText =
      'Analyze this merch design and respond with only a JSON object (no markdown, no extra text) with exactly two keys:\n' +
      `"fontCategory": one of ${FONT_CATEGORIES.join(', ')}\n` +
      `"shape": one of ${ART_SHAPES.join(', ')} — "circular" if the design is a round badge/button/seal/coin shape, "rectangular" for anything else (including shields, banners, or full-bleed art with no distinct outline).\n` +
      `Intended color palette: ${context.colorPalette || 'unspecified'}. Intended style tag: ${context.styleTag || 'unspecified'}.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 50,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      fontCategory: isFontCategory(parsed.fontCategory) ? parsed.fontCategory : DEFAULT_CATEGORY,
      shape: isArtShape(parsed.shape) ? parsed.shape : DEFAULT_SHAPE,
    };
  } catch {
    return { fontCategory: DEFAULT_CATEGORY, shape: DEFAULT_SHAPE };
  }
}
