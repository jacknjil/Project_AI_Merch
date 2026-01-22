export type PromptTemplate = {
  id: string;
  label: string;
  description?: string;
  build: (vars?: Record<string, string>) => string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "retro_synthwave",
    label: "Retro Synthwave",
    description: "Neon grid, glowing sun, 80s retro-futuristic design",
    build: (vars) => `
A high-quality synthwave t-shirt design featuring ${vars?.subject || "a silhouetted mountain"}.
Vibrant neon grid, retro sun with glowing rays, deep purples and pinks,
crisp vector lines, 1980s vaporwave aesthetic, centered composition.
`,
  },

  {
    id: "cute_animal",
    label: "Cute Animal Mascot",
    description: "Kawaii-style animal for stickers or apparel",
    build: (vars) => `
A super cute kawaii-style ${vars?.animal || "cat"} mascot illustration.
Soft pastel colors, rounded shapes, big expressive eyes,
clean outlines, perfect for stickers or t-shirts.
`,
  },

  {
    id: "vintage_badge",
    label: "Vintage Badge Logo",
    description: "Outdoor / adventure / retro badge",
    build: (vars) => `
A vintage outdoor badge logo design featuring ${vars?.theme || "a mountain landscape"}.
Distressed texture, bold outlines, retro color palette,
perfect for apparel prints and patches.
`,
  },

  {
    id: "minimalist_line",
    label: "Minimalist Line Art",
    description: "Elegant single-line drawing",
    build: (vars) => `
A minimalist single-line continuous drawing of ${vars?.subject || "a flower"}.
Clean vector lines, elegant curves, modern aesthetic,
perfect for tote bags, apparel, and prints.
`,
  },

  {
    id: "gaming_character",
    label: "Gaming Character",
    description: "Epic mascot for esports / gaming shirts",
    build: (vars) => `
A powerful esports mascot illustration of ${vars?.character || "a cyber ninja"}.
Dynamic pose, sharp highlights, glowing accents, bold outlines,
designed for gaming apparel.
`,
  },
];
