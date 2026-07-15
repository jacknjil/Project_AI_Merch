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

const DEFAULT_CATEGORY: FontCategory = 'bold-display';

export interface StyleAnalysisContext {
  colorPalette?: string;
  styleTag?: string;
}

function isFontCategory(value: unknown): value is FontCategory {
  return typeof value === 'string' && (FONT_CATEGORIES as string[]).includes(value);
}

export async function classifyFontCategory(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<FontCategory> {
  try {
    const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    const promptText =
      `Classify this merch design's visual style into exactly one category from this list: ${FONT_CATEGORIES.join(', ')}.\n` +
      `Intended color palette: ${context.colorPalette || 'unspecified'}. Intended style tag: ${context.styleTag || 'unspecified'}.\n` +
      'Respond with only the category name, nothing else.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 20,
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
    return isFontCategory(raw) ? raw : DEFAULT_CATEGORY;
  } catch {
    return DEFAULT_CATEGORY;
  }
}
