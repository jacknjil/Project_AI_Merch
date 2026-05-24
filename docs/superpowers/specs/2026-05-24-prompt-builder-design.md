# Prompt Builder & AI Enhancement — Design Spec

**Date:** 2026-05-24  
**Sprint:** 8  
**Status:** Approved

## Problem

Non-technical users (including the store owner) struggle to write effective DALL-E prompts. The current `/studio/generate` page offers 5 hardcoded templates via a dropdown, but provides no guidance for composing original prompts. This results in poor image quality and friction for both admin use and future customer-facing use.

## Goal

Replace the template dropdown with a guided 5-field prompt builder that assembles prompts automatically, plus an optional AI enhancement step that expands the assembled prompt into a richer DALL-E instruction via GPT-4.1-mini.

## Scope

- Primary users: admin/creator (now) + end customers (same page, later)
- Single page upgrade: `/studio/generate`
- No new pages, no routing changes, no new dependencies

## Architecture

### New Files

**`src/lib/promptBuilder.ts`**  
Configuration and assembly logic:

- `NICHES` — list of niche options (nurses, teachers, dogs, astrology, gaming, hiking, general)
- `SUBJECTS_BY_NICHE` — map of niche → suggested subject options (curated, ~5-8 per niche)
- `STYLE_TAGS` — list of style options matching existing sheet styleTags
- `MOODS` — list of mood options
- `COLOR_PALETTES` — list of palette options
- `buildPrompt(fields)` — assembles a structured prompt string from the 5 fields; handles missing/empty fields gracefully

**`src/app/api/studio/enhance-prompt/route.ts`**  
POST endpoint:

- Input: `{ prompt: string }`
- Calls GPT-4.1-mini via existing `src/lib/openai.ts` client
- System prompt instructs model to expand into a detailed, merch-optimized DALL-E prompt
- Output: `{ enhancedPrompt: string }`
- On failure: returns 500 with `{ error: string }` — never blocks generation

### Modified Files

**`src/app/studio/generate/page.tsx`**  
Left panel changes:

- Remove: template dropdown
- Add: 5 builder fields (Niche → Subject → Style → Mood → Color Palette)
  - Subject field: dropdown seeded from `SUBJECTS_BY_NICHE[selectedNiche]` + free-text input fallback
  - All other fields: simple `<select>` elements
- Add: "Enhance Prompt ✦" button between builder and Generate button
  - Shows loading state during GPT call
  - On success: overwrites prompt textarea with enhanced version
  - On failure: shows inline error, textarea unchanged
- Keep: prompt textarea (always visible and editable)
- Keep: existing Quick Templates section (renamed from "Prompt Template") as a fast-start shortcut

### Unchanged Files

- `src/lib/promptTemplates.ts` — existing 5 templates kept as-is
- `src/app/api/studio/generate/route.ts` — no changes
- `src/lib/openai.ts` — used as-is

## Data Flow

```text
User fills fields
      ↓
buildPrompt(fields) → populates textarea (live)
      ↓ (optional)
"Enhance" button → POST /api/studio/enhance-prompt
      ↓
GPT-4.1-mini expands prompt → overwrites textarea
      ↓
User edits if desired
      ↓
"Generate" button → POST /api/studio/generate (unchanged)
      ↓
DALL-E images appear in right panel
```

## Error Handling

| Scenario                   | Behavior                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| Enhance API fails          | Inline error shown, textarea keeps original prompt, Generate still works |
| Fields empty on Enhance    | Button disabled until at least Subject is filled                         |
| Generate with empty prompt | Existing validation unchanged ("Please enter a prompt")                  |

## Sheet Metadata Gap (follow-up, not in this sprint)

The builder introduces `mood` and `colorPalette` as first-class fields but the Google Sheet currently tracks `colorPalette` (column G) — `mood` has no sheet column. When sheet sync is next revisited, add a `mood` column to the sheet schema and update the n8n workflow to write it.

## Success Criteria

1. User can fill 5 fields and see a coherent prompt assembled in the textarea without typing anything
2. "Enhance" button produces a noticeably richer prompt via GPT
3. Enhanced prompt can be manually edited before generating
4. Enhance failure does not prevent image generation
5. Existing template shortcuts still work
