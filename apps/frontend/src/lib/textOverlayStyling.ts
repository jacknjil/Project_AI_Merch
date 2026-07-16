import { analyzeArtStyle, type StyleAnalysisContext, type ArtShape } from './artStyleAnalysis';
import { deriveTextColors } from './colorExtraction';
import { loadFontForCategory } from './fontLibrary';

export interface ResolvedOverlayStyle {
  fontBuffer: Buffer;
  fill: string;
  stroke: string;
  shape: ArtShape;
}

export async function resolveOverlayStyle(
  imageBuffer: Buffer,
  context: StyleAnalysisContext = {},
): Promise<ResolvedOverlayStyle> {
  const [style, colors] = await Promise.all([
    analyzeArtStyle(imageBuffer, context),
    deriveTextColors(imageBuffer),
  ]);

  return {
    fontBuffer: loadFontForCategory(style.fontCategory),
    fill: colors.fill,
    stroke: colors.stroke,
    shape: style.shape,
  };
}
