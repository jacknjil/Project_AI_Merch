# n8n Workflow Change: Split Art Prompt from On-Design Phrase

**Workflow:** `AI_Merch - Batch from Sheet` (ID `HlxK50rV54KSiNRD`)
**Why:** `/api/n8n/create-asset` now accepts an optional `phrase` field and composites it onto generated art via the tested text-overlay pipeline (see `docs/superpowers/plans/2026-07-13-text-overlay-app-side.md`). Today the GPT step blends everything — including on-design wording — into one Recraft prompt, so Recraft ends up trying to draw the text itself (unreliably). This change makes GPT emit the art prompt and the on-design phrase as two separate values, and threads `phrase` through to the existing HTTP call.

**Access note:** drafted from the workflow structure documented in `CLAUDE.md` (no live n8n MCP connection in this session) — paste into the actual n8n UI and adjust against the real node content rather than treating this as a verified diff.

---

## 1. "Message a model1" node (GPT-4.1-mini)

Current behavior: builds one refined Recraft prompt from the sheet's `concept` field.

**Change the prompt to:**

```
You are building inputs for an AI merch pipeline with two separate outputs:

1. "prompt" — a Recraft art-generation prompt. Describe visual composition
   only: character/scene, style, colors, layout. Never ask for text,
   lettering, words, or typography to be drawn as part of the image. Always
   end it with: "no text, no lettering, no watermark"

2. "phrase" — the short on-design headline/catchphrase for this concept
   (e.g. "Espresso Yourself"), to be composited separately afterward by a
   different system. Keep it under 30 characters. Leave it as an empty
   string "" if this concept has no natural catchphrase.

Given this concept: {{ $json.concept }}
Niche: {{ $json.niche }}
Style tag: {{ $json.styleTag }}

Return strict JSON only, no markdown fences: {"prompt": "...", "phrase": "..."}
```

If the node has a "Response Format: JSON" / structured-output option, enable it — otherwise the next node has to parse raw text.

## 2. New node: "Parse Prompt+Phrase" (Code node, insert right after the GPT node)

GPT's raw output lands in something like `$json.message.content` (exact path depends on the OpenAI node version). Add a small Code node to parse it and promote both fields to the top level for downstream nodes:

```javascript
const raw = $input.first().json.message?.content ?? $input.first().json.content ?? '';
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  // Fallback: treat the whole thing as the art prompt, no phrase, rather
  // than failing the row outright.
  parsed = { prompt: raw, phrase: '' };
}

return [{
  json: {
    ...$input.first().json,
    prompt: parsed.prompt ?? '',
    phrase: parsed.phrase ?? '',
  },
}];
```

## 3. "Build Request" node

This is the node with the known history of silently dropping fields (it previously dropped `title` — see `project_storefront_titles_backfill.md` in memory). Add `phrase` to its `request{}` object alongside the existing fields:

```javascript
request: {
  ...existing fields...,
  phrase: $json.phrase,
}
```

Double-check it actually appears in the node's output panel after a test run — that's exactly how the `title` bug was caught last time.

## 4. "Generate assets" HTTP node

POSTs to `https://ai-merch.jjrsguide.com/api/n8n/create-asset`. Confirm the JSON body includes:

```json
"phrase": "{{ $json.phrase }}"
```

No other changes needed here — the route already accepts `phrase` as optional and additive (empty string behaves identically to omitting it entirely).

## 5. Optional: log `phrase` back to the sheet

The Products sheet (`1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM`) has no `phrase` column today. Not required for the pipeline to function, but worth adding for QA visibility — same pattern as the existing "Updates the sheet row status" step, one more column write.

---

## Rollout

Per the source planning doc's own deployment philosophy (iterate locally across all 5 niches before touching production):

1. Duplicate the workflow (or test on a single `n8n_status=todo` row) before editing the live one.
2. Run one row through manually, inspect the "Build Request" node's output panel to confirm `phrase` actually made it through (not just `prompt`).
3. Spot-check the resulting Firestore asset's `phrase` field and the composited image before flipping this on for the full batch.
4. This does **not** need the shrink-fallback visual question resolved first — `applyTextOverlayWithFallback` already handles that automatically either way. It only needs the GPT/Build Request/HTTP changes above to land.
