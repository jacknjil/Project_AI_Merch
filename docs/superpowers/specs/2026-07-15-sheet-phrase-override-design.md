# Sheet-Controlled Phrase Override for Text Overlay

**Workflow:** `AI_Merch - Batch from Sheet` (ID `HlxK50rV54KSiNRD`)
**Supersedes/extends:** `docs/superpowers/specs/2026-07-13-n8n-phrase-prompt-split-design.md` (the prompt/phrase split was drafted but never applied to the live workflow). This spec keeps that draft's GPT prompt/phrase split intact and adds the piece it left open: not every row should get a text overlay, and GPT's per-concept judgment shouldn't be the only control.

**Why:** `/api/n8n/create-asset` already gates text-overlay compositing correctly — it only runs when the incoming `phrase` field is a non-empty string (`route.ts` line 269: `if (phrase) { ... }`). The gap is upstream: the live n8n workflow doesn't send a `phrase` field at all yet, and relying purely on GPT's per-concept judgment (as the 07-13 draft proposed) gives no deterministic, auditable control per row. This spec adds a sheet column so a row's phrase can be explicitly authored, explicitly suppressed, or left to GPT — with the resolved outcome written back to the sheet so it's reviewable.

---

## 1. Products sheet: new `phrase` column

Add a `phrase` column to the Products sheet (`1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM`, Sheet1). Three states:

| Cell value | Meaning |
| --- | --- |
| Blank | Defer to GPT's per-concept judgment (may invent a short catchphrase, or decide none fits). |
| Explicit text (e.g. `"Espresso Yourself"`) | Used verbatim as the overlay phrase. GPT may still suggest something, but it's discarded for this row. |
| `"none"` (case-insensitive) | Forces `phrase = ""` — text overlay is skipped outright, regardless of what GPT would have chosen. |

**Precedence when resolving the final phrase:** explicit text > `"none"` sentinel > GPT's invented value.

## 2. "Message a model1" node (GPT-4.1-mini) — unchanged from the 07-13 draft

Still emits `{"prompt": "...", "phrase": "..."}` per row, per the existing draft's prompt language (concept → art prompt, plus GPT's own best-guess phrase or `""`). GPT's `phrase` output is now treated as a *suggestion*, not the final value — resolution happens downstream.

## 3. "Parse Prompt+Phrase" Code node — extended with precedence logic

Building on the 07-13 draft's parse node, add sheet-value precedence before setting the final `phrase`:

```javascript
const raw = $input.first().json.message?.content ?? $input.first().json.content ?? '';
let parsed;
let parseSucceeded = true;
try {
  parsed = JSON.parse(raw);
} catch {
  parsed = { prompt: raw, phrase: '' };
  parseSucceeded = false;
}

const sheetPhrase = ($input.first().json.phrase ?? '').toString().trim();
const isNoneSentinel = sheetPhrase.toLowerCase() === 'none';

let finalPhrase;
let writeBackValue;
if (sheetPhrase && !isNoneSentinel) {
  // Explicit text wins outright.
  finalPhrase = sheetPhrase;
  writeBackValue = sheetPhrase;
} else if (isNoneSentinel) {
  // Explicit suppression.
  finalPhrase = '';
  writeBackValue = 'none';
} else if (!parseSucceeded) {
  // Blank cell + GPT response didn't parse: technical hiccup, not a real
  // "no phrase" judgment. Leave the sheet untouched so the row can retry.
  finalPhrase = '';
  writeBackValue = sheetPhrase; // stays blank
} else {
  // Blank cell, GPT parsed successfully: defer to GPT's judgment. Empty
  // GPT judgment gets written back as "none" so a blank cell always means
  // "not yet run," never "ran and decided nothing."
  finalPhrase = parsed.phrase ?? '';
  writeBackValue = finalPhrase || 'none';
}

return [{
  json: {
    ...$input.first().json,
    prompt: parsed.prompt ?? '',
    phrase: finalPhrase,
    phraseWriteBack: writeBackValue,
  },
}];
```

## 4. "Build Request" node — unchanged from the 07-13 draft

Still adds `phrase: $json.phrase` to the request object (the resolved final value, not GPT's raw suggestion). This node has a known history of silently dropping fields (previously dropped `title` — see `project_storefront_titles_backfill.md` in memory), so verify `phrase` actually appears in its output panel after a test run.

## 5. "Generate assets" HTTP node — unchanged

POSTs `"phrase": "{{ $json.phrase }}"` to `/api/n8n/create-asset`. No app-side changes needed — the route already treats empty string and omission identically.

## 6. Sheet write-back — new

Extend the existing "Updates the sheet row status" step (the one that already writes `n8n_status`/`lastRun`) to also write `$json.phraseWriteBack` into the row's `phrase` column. This makes every processed row self-documenting:

- Explicit text you authored → written back unchanged (no-op, confirms it was used).
- Blank + GPT invented a phrase → sheet now shows what was actually composited.
- Blank + GPT decided nothing fits, or explicit `"none"` → sheet shows `"none"`.
- Blank + GPT parse failure → sheet stays blank, eligible for retry.

## 7. `CLAUDE.md` documentation

The Products sheet column list in `CLAUDE.md` needs `phrase` added once this ships (currently not listed — confirmed absent per prior research).

---

## Rollout / Testing

Reusing the 07-13 draft's philosophy (verify on single rows before batch):

1. Add the `phrase` column to the live sheet (blank for all existing rows initially).
2. Apply the node changes to the live n8n workflow (not a duplicate — small enough to edit directly, but test before enabling batch runs).
3. Manually set up three test rows to cover all three states:
   - One row with an explicit phrase.
   - One row with `"none"`.
   - One row left blank (GPT judgment).
4. Run each individually (`n8n_status=todo`), inspect the "Parse Prompt+Phrase" and "Build Request" node output panels to confirm `phrase` resolves as expected in each case.
5. Confirm the sheet write-back lands correctly for all three cases, including the parse-failure blank-stays-blank behavior (can simulate by temporarily feeding malformed GPT output, or accept as untested-in-practice if that's impractical to trigger deliberately).
6. Spot-check the resulting Firestore asset's `phrase` field and the composited (or non-composited) image before flipping this on for a full batch run.

## Out of scope

- Auditing existing `typography-humor` rows for the row-354-style concept bug (separate open item, tracked independently).
- The shrink-fallback visual tradeoff (unaffected by this change — `applyTextOverlayWithFallback` already handles it either way, per the 07-13 draft's own note).
- Any app-side (`route.ts`, `textOverlay.ts`) code changes — none required.
