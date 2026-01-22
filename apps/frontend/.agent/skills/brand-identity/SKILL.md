---
name: maintaining-brand-identity
description: Defines the visual language, design tokens, and creative direction for the AI Merch store. Use this when generating new UI components or engineering prompts for the n8n image generation pipeline.
---

# Brand Identity & Visual Strategy

## When to use this skill

- Before creating new React/Tailwind components.
- When refining the "Prompt Template" inside the n8n image generation node.
- When writing customer-facing copy for the frontend.

## The Visual Filter: Style Guidelines

### 1. Design Tokens (The DNA)

- **Primary Palette:** Consult `resources/design-tokens.json` for Hex codes.
- **Typography:** Use the defined font pairings (Heading vs. Body) to maintain a premium "AI-forward" aesthetic.
- **Spacing:** Follow the Tailwind-based layout rules to ensure clean, minimalist white space.

### 2. AI Image Generation Style (The "Look")

When sending prompts to the n8n pipeline, the agent must append these "Style Signatures":

- **Art Style:** (e.g., "Photorealistic, cinematic lighting, 8k resolution, minimalist background")
- **Consistency:** Ensure the "Merch Type" (T-shirt, Hoodie, etc.) matches the visual mockups defined in the UX stack.

### 3. Voice and Tone

- **Personality:** Professional, innovative, and sleek (Antigravity Engineering style).
- **Language:** Avoid hype-heavy "marketing speak." Use clear, value-driven descriptions for the merch.

## Brand Checklist

- [ ] UI colors match the Primary/Secondary tokens.
- [ ] AI prompts include the "Style Signature" for visual consistency.
- [ ] Typography hierarchy is maintained across all pages.
- [ ] Logos and icons use the correct SVG assets.

## Resources

- `resources/design-tokens.json`: The technical source of truth for CSS/Tailwind variables.
