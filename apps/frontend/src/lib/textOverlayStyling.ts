import { classifyFontCategory, type StyleAnalysisContext } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { loadFontForCategory } from './fontLibrary';

export interface ResolvedOverlayStyle {
  fontBuffer: Buffer;
  fill: string;
  stroke: string;
}

export async function resolveOverlayStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ResolvedOverlayStyle> {
  const [category, colors] = await Promise.all([
    classifyFontCategory(imageBuffer, context),
    deriveTextColors(imageBuffer),
  ]);

  return {
    fontBuffer: loadFontForCategory(category),
    fill: colors.fill,
    stroke: colors.stroke,
  };
}
