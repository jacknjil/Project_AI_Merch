export type PromptTemplate = {
  id: string;
  label: string;
  description?: string;
  build: (vars?: Record<string, string>) => string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "retro_pixel",
    label: "Retro Pixel Art",
    description: "8-bit astronaut for nostalgia-themed apparel",
    build: () => `
8-bit pixel art t-shirt design: a heroic pixel astronaut floating in deep space, holding a glowing star, retro arcade game sprite style.
Electric blue sky, golden yellow highlights, deep navy background. Chunky pixel grid, hard edges, no anti-aliasing.
Centered composition, transparent background, print-ready for dark apparel.
`,
  },

  {
    id: "celestial_mystic",
    label: "Celestial Mystic",
    description: "Moon goddess with sacred geometry for cosmic-themed apparel",
    build: () => `
Intricate illustration of a crescent moon goddess surrounded by swirling constellations, a sacred geometry mandala, and blooming celestial flowers.
Deep midnight blue background, rich gold linework, soft violet accents. Art nouveau aesthetic, detailed symmetrical composition.
Merch-print ready, clean edges, suitable for dark t-shirts and tote bags.
`,
  },

  {
    id: "vintage_park_poster",
    label: "Vintage Park Poster",
    description: "WPA-style retro outdoor poster for nature lovers",
    build: () => `
Vintage WPA-style national park poster illustration: a majestic mountain peak reflected in a glassy alpine lake, framed by tall pine trees and a bold sunburst arc.
Flat retro color palette — forest green, burnt sienna, cream, and navy. 1930s bold poster aesthetic, no gradients, no photo-realism.
Centered badge composition, strong silhouettes, crisp edges, perfect for printing on light fabric.
`,
  },

  {
    id: "kawaii_corgi",
    label: "Kawaii Corgi",
    description: "Adorable chibi pet character for animal lover apparel",
    build: () => `
Adorable kawaii chibi corgi with huge shining eyes, fluffy rounded ears, and a gentle smile, sitting with tiny paws raised.
Soft pastel palette — blush pink, lavender, cream, warm tan fur. Clean vector outlines, smooth shading, Studio Ghibli-inspired warmth.
Transparent background, sticker-ready composition, perfect for t-shirts, tote bags, and patches.
`,
  },

  {
    id: "cyberpunk_neon",
    label: "Cyberpunk Neon",
    description: "Bold neon-lit warrior for gaming and streetwear",
    build: () => `
A sleek cyberpunk cat warrior in a neon-lit rain-soaked alley, wearing a hooded cloak with glowing circuit patterns, katana drawn.
Electric pink and cyan neon reflections on wet pavement, deep navy background. Bold cel-shaded illustration style, high contrast, sharp outlines.
Dynamic 3/4 front-view pose, t-shirt print ready, clean edges on a dark background.
`,
  },
];
