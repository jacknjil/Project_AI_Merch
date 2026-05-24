export type BuilderFields = {
  niche: string;
  subject: string;
  style: string;
  mood: string;
  colorPalette: string;
};

export const NICHES = [
  { value: 'nurses', label: 'Nurses' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'dogs', label: 'Dog Lovers' },
  { value: 'astrology', label: 'Astrology' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'hiking', label: 'Hiking / Outdoors' },
  { value: 'general', label: 'General' },
];

export const SUBJECTS_BY_NICHE: Record<string, string[]> = {
  nurses: ['stethoscope', 'coffee cup with scrubs', 'heartbeat monitor', 'nursing cap', 'syringe'],
  teachers: ['red apple', 'stack of books', 'chalkboard', 'pencil', 'graduation cap'],
  dogs: ['golden retriever', 'pug face', 'dachshund', 'dog paw print', 'dog bone'],
  astrology: ['zodiac wheel', 'moon phases', 'crystal ball', 'star map', 'celestial sun and moon'],
  gaming: ['game controller', 'pixel heart', 'cyber ninja', 'retro arcade cabinet', 'space invader'],
  hiking: ['mountain trail at sunrise', 'campfire under stars', 'compass rose', 'pine forest', 'bear silhouette'],
  general: ['wolf howling at moon', 'astronaut floating', 'dragon', 'phoenix rising', 'tiger'],
};

export const STYLE_TAGS = [
  { value: 'vintage-badge', label: 'Vintage Badge' },
  { value: 'retro-pixel', label: 'Retro Pixel' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'minimalist-line', label: 'Minimalist Line Art' },
  { value: 'kawaii', label: 'Kawaii / Cute' },
  { value: 'typography-humor', label: 'Typography / Humor' },
  { value: 'celestial-mystical', label: 'Celestial / Mystical' },
  { value: 'retro-poster', label: 'Retro Poster' },
  { value: 'illustration', label: 'Illustration' },
];

export const MOODS = [
  { value: 'epic', label: 'Epic' },
  { value: 'cute', label: 'Cute' },
  { value: 'dark', label: 'Dark' },
  { value: 'playful', label: 'Playful' },
  { value: 'elegant', label: 'Elegant' },
  { value: 'bold', label: 'Bold' },
  { value: 'mysterious', label: 'Mysterious' },
  { value: 'energetic', label: 'Energetic' },
];

export const COLOR_PALETTES = [
  { value: 'neon', label: 'Neon' },
  { value: 'earth tones', label: 'Earth Tones' },
  { value: 'monochrome', label: 'Monochrome' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'dark and gold', label: 'Dark & Gold' },
  { value: 'ocean blue', label: 'Ocean Blue' },
  { value: 'forest green', label: 'Forest Green' },
];

export function buildPrompt(fields: Partial<BuilderFields>): string {
  const { subject, style, mood, colorPalette, niche } = fields;
  if (!subject) return '';

  const parts: string[] = [`A high-quality merch design featuring ${subject}`];
  if (style) parts.push(`${style} aesthetic`);
  if (mood) parts.push(`${mood} mood`);
  if (colorPalette) parts.push(`${colorPalette} color palette`);
  if (niche && niche !== 'general') parts.push(`perfect for the ${niche} niche`);
  parts.push('clean composition, print-ready');

  return parts.join(', ') + '.';
}
