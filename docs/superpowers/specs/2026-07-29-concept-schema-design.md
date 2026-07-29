# Concept-Generation Schema — Design Spec

**Date:** 2026-07-29
**Status:** Approved (manual-template phase only — see Scope)

## Problem

The n8n batch pipeline's `concept` sheet column is free-text prose, hand-written per row. There's no structure to guide what goes in it, no feedback loop before a real (paid) generation fires, and quality depends entirely on the writer's prompt-design skill. This produces long, unevenly-detailed cells (row 88's `concept` runs ~105 words of unstructured prose) where it's easy to omit a detail without noticing, and hard to spot what's missing at a glance.

Research into published prompt-engineering frameworks (Formula, CLEAR, Subject+Context+Style, Core Prompt Elements — see `PROMPT TEMPLATE & GUIDES/` screenshots) surfaced partial overlap but also plenty of framework content aimed at photography/scene prompting (lighting, camera framing, location) that doesn't apply to this app's flat-vector, print-ready merch graphics.

## Goal

Give the `concept` field a small, explicit structure — just the genuinely missing pieces — so writing a concept becomes filling labeled slots instead of composing free prose, without adding infrastructure that isn't yet proven necessary.

## Schema

| Field                    | Definition                                                                       | Source            |
| ------------------------ | ---------------------------------------------------------------------------------| ------------------ |
| **Subject**              | The concrete visual noun — the literal thing being drawn, not the niche category | New                |
| **Action**               | What the subject is doing — pose, expression, or the joke/hook itself            | New                |
| **Composition**          | Layout: text-vs-art placement, framing, texture/finish                           | New                |
| **Location/Context** *(optional)* | The physical setting/scene, when the concept actually has one — skip entirely for scene-less designs | New, added after row 88 live-test revision |
| **Style**                | Existing `styleTag` sheet column                                                 | Reused, unchanged  |
| **Color**                | Existing `colorPalette` sheet column                                             | Reused, unchanged  |

**Location/Context usage rule:** only fill this slot when the concept genuinely places the subject in a scene (a bench, a room, a landscape). Leave it out for designs with no background (e.g. row 88's dog-in-a-box). When used, it must be **concrete**, not mood-evoking — name the physical anchor object and explicitly state what's *not* there if the style vocabulary risks a wrong association (e.g. "a wooden park bench with visible slats, dogs seated on top; flat skyline silhouettes behind, no sun/gradient/horizon glow"). Vague language ("abstract... to evoke... without overwhelming detail") is exactly what caused the ambiguity in the row 88 live test below — it's the opposite of CLEAR's "Explicit" principle.

**Still excluded:** Lighting. Judged not applicable — flat vector/typography graphics don't have a light source, and nothing in live testing so far has contradicted that.

**Assembly template:**

```text
Centered graphic design: {Subject}, {Action}.
Composition: {Composition}.[ Setting: {Location/Context}.]
Style: {styleTag}. Colors: {colorPalette}.
```

(Setting clause included only when Location/Context is used.)

This mirrors the existing `buildPrompt()` pattern in `src/lib/promptTemplates.ts` (the Studio flow's 5-field builder) — same shape, adapted to the batch sheet's fields, not new architecture.

## Engine Independence

Generator-specific quirks (Recraft's `controls.no_text` API parameter, its documented compositional biases like the crossed-utensil bug, run-to-run randomness) are deliberately kept **outside** this schema. The four core fields describe _what_ to generate, not _how to talk to Recraft specifically_. If the image engine is ever swapped, only an engine-specific adapter layer should need to change — not this schema.

## Worked Example — Row 88

`title`: "Dog Logic: If I Fits, I Sits" · `niche`: dogs · `styleTag`: typography-humor · `colorPalette`: mustard yellow, charcoal black, soft cream

**Original `concept` (~105 words, unstructured prose):** bold hand-drawn "Dog Logic" title, humorous "If I Fits, I Sits" script tagline, a small dog squeezing into an impossibly tiny box (mischievous/proud expression, negative-space box outline), balanced compact layout, vintage screen-printed texture.

**Reassembled via the schema (~65 words):**

> Centered graphic design: a small dog squeezing itself into an impossibly tiny box, mischievous and proud expression, negative space outlining the box shape. Composition: bold hand-drawn "Dog Logic" title top, dog illustration centered, "If I Fits, I Sits" casual script tagline below, balanced compact layout, vintage screen-printed texture. Style: typography-humor. Colors: mustard yellow, charcoal black, soft cream.

Same information content, ~40% shorter, and each clause has an explicit home — a missing field is now visible as an empty slot rather than a silent omission.

Row 88's actual sheet `concept` cell was **not** modified — this is a design-time worked example only, per the live-production-data-verification rule (real sheet writes require explicit in-session confirmation, not assumed from a design exercise).

## Live Test Finding — Row 88, Bench Scene (post-approval revision)

User hand-wrote a second row 88 concept using the schema (a pack of dogs on a city park bench, urban skyline background) and ran a real generation. Result: the image was ambiguous — unclear whether the dogs were on a park bench or "just gazing into the sunset."

**Root cause:** the setting/background had no dedicated slot in the original 4-field schema, so it got compressed into the Composition clause with mood-evoking rather than concrete wording ("abstract... to evoke an urban setting without overwhelming detail"). Compounding this, "skyscraper silhouettes" pattern-matches this app's own recurring silhouette-against-sky-band motif (seen in existing vintage-badge rows like "Vintage National Park Badge" — mountain silhouette + sun rays), which likely biased Recraft toward a horizon/sunset-glow rendering absent a concrete foreground anchor.

**Conclusion:** the original "flat vector graphics never have a scene" assumption was correct for row 88's original dog-in-a-box design but wrong for concepts that genuinely involve a placed setting. Fix: added **Location/Context back as an optional field** (see Schema above) with an explicit concreteness requirement, rather than reinstating it universally.

## Scope

This spec covers the **schema and template only**, applied by hand. It deliberately does **not** include:

- New sheet columns for Subject/Action/Composition
- Any script or n8n node to assemble `concept` automatically
- Any change to the live `AI_Merch - Batch from Sheet` workflow (`HlxK50rV54KSiNRD`)

Reasoning: the cheapest way to validate whether this schema is actually an improvement is to hand-apply it to a few real rows first, before investing in columns/scripts/workflow changes. Approach A/B from the prior design session are still on the table as the next phase.

## Follow-Up (not in this session)

- **Sheet-column promotion:** if manual use of this schema across a handful of rows proves it out, add `subject`/`action`/`composition` as real sheet columns and port a small assembly helper (mirroring `buildPrompt()`) into either a standalone script or the n8n "Build Request" node.
- **resolvedPrompt preview column (Approach B):** still un-started from the prior session — writing GPT's expanded prompt back to the sheet before the real generation call fires, so drift is visible before a generation is spent. Independent of this schema; can be built in either order.
- **Five-point requirement template:** the external template the user originally recalled is still unlocated. This schema was derived from the four screenshots found instead — if the original template turns up later, compare against it rather than assuming this schema supersedes it.

## Success Criteria

1. A concept can be written by filling labeled slots (Subject/Action/Composition, optional Location/Context, + existing Style/Color) instead of composing free prose.
2. The assembled string is equal or better in information density vs. hand-written prose, on at least one real row (row 88, above).
3. No sheet, script, or n8n changes required to adopt this — usable immediately, by hand, on the next few rows written.
4. Scenes with a genuine physical setting (e.g. row 88's bench concept) render unambiguously once Location/Context is filled in with a concrete, non-mood-evoking description.
