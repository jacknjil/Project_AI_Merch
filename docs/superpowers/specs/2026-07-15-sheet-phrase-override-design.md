# Sheet-Controlled Phrase Override for Text Overlay

**Workflow:** `AI_Merch - Batch from Sheet` (ID `HlxK50rV54KSiNRD`)
**Supersedes/extends:** `docs/superpowers/specs/2026-07-13-n8n-phrase-prompt-split-design.md`. That draft proposed a JSON-based prompt/phrase split via a new "Parse Prompt+Phrase" Code node. **It was never applied as written.** Live-workflow inspection on 2026-07-15 found that a *different, already-working* prompt/phrase split was built directly into the live workflow at some point (undocumented in this repo) — GPT emits a trailing `PHRASE: <text>` / `PHRASE: NONE` line instead of JSON, and the existing `Build Request` Code node already parses it. This spec was revised in place after that discovery to build on the real live implementation instead of the stale draft.

**Why:** `/api/n8n/create-asset` already gates text-overlay compositing correctly — it only runs when the incoming `phrase` field is a non-empty string (`route.ts` line 269). The live n8n workflow already lets GPT decide, per concept, whether a phrase belongs (`PHRASE: NONE` when nothing fits). What's missing is a **deterministic, auditable override**: a way to explicitly author a phrase, explicitly force no phrase, or explicitly confirm/correct what GPT chose — none of which exist today, since there's no `phrase` column in the sheet and GPT's choice is never written back for review.

---

## Live workflow inspection findings (2026-07-15)

Fetched via `GET /api/v1/workflows/HlxK50rV54KSiNRD` against `https://n8n.jjrsguide.com`. Relevant nodes, as they exist **today**, before this change:

- **"Message a model1"** (`@n8n/n8n-nodes-langchain.openAi`) — system prompt already instructs GPT to output the art prompt, then on its own line: `PHRASE: <short catchphrase>` or `PHRASE: NONE`. **No changes needed to this node.**
- **"Build Request"** (`n8n-nodes-base.code`) — already extracts GPT's raw text, splits off the trailing `PHRASE:` line via regex (`splitPhrase()`), treats `NONE` (case-insensitive) as empty phrase, and already includes `phrase` in the `request{}` object sent downstream. **This is the node that needs the new precedence logic** (Section 2 below).
- **"Get row(s) in sheet"** (`n8n-nodes-base.googleSheets`) — no column allowlist; it reads every column present in the sheet dynamically. Adding a `phrase` header to the sheet makes `$json.phrase` available on every row with **zero changes to this node**.
- **"Update row in sheet"** (`n8n-nodes-base.googleSheets`) — has an explicit write allowlist (`columns.value`): `id, rowId, n8n_status, n8n_error, assetIds, imageUrl, firebaseProductId, published, lastRun, retryCount`. `phrase` is not in it — **this node needs one field added** (Section 3 below).
- **"Generate assets"** (`n8n-nodes-base.httpRequest`) — POST body already includes `"phrase": "={{ $json.phrase }}"`, reading from the same top-level field `Build Request` sets. **No changes needed to this node.**

Net scope: **one sheet column + edits to exactly two nodes.** No new nodes, no JSON-parsing rework.

---

## 1. Products sheet: new `phrase` column

Add a `phrase` header to the Products sheet (`1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM`, Sheet1/`gid=164939025`), in the first empty column after `notes`. Three states:

| Cell value | Meaning |
| --- | --- |
| Blank | Defer to GPT's per-concept judgment (its own `PHRASE:` line — a real phrase, or `NONE`). |
| Explicit text (e.g. `"Espresso Yourself"`) | Used verbatim. GPT's own `PHRASE:` line is discarded for this row. |
| `"none"` (case-insensitive) | Forces `phrase = ""` — overlay skipped — regardless of GPT's `PHRASE:` line. |

**Precedence:** explicit sheet text > `"none"` sentinel > GPT's `PHRASE:` line.

This is a manual sheet edit (add the header cell), not a code change — no Sheets API automation needed for the column itself.

## 2. "Build Request" node — add precedence logic

**Current `jsCode`** (verified live, 2026-07-15):

```javascript
const row = $json || {};
const clean = (v) => (v !== undefined && v !== null ? String(v).trim() : '');

const idStr = clean(row.rowId || row.id);

// Extract text from GPT output (handles both string and structured object formats)
function extractGptText(output) {
  if (!output) return '';
  if (typeof output === 'string') return output.trim();
  if (Array.isArray(output)) {
    const msg = output[0];
    if (msg?.content?.[0]?.text) return msg.content[0].text.trim();
    if (msg?.text) return String(msg.text).trim();
  }
  return '';
}

const rawText = extractGptText(row.output);

// Split off the trailing "PHRASE: ..." line the GPT prompt now appends, so the
// on-design phrase is composited separately (Recraft can't render legible
// text) instead of being baked into the art prompt itself.
function splitPhrase(text) {
  const match = text.match(/\n?PHRASE:\s*(.*)\s*$/i);
  if (!match) return { prompt: text, phrase: '' };
  const phraseValue = match[1].trim();
  const prompt = text.slice(0, match.index).trim();
  return { prompt, phrase: phraseValue.toUpperCase() === 'NONE' ? '' : phraseValue };
}

const { prompt: robustPrompt, phrase } = splitPhrase(rawText);

if (!idStr) return { ...row, error: 'Missing ID for matching' };
if (!robustPrompt) return { ...row, error: 'AI failed to generate a robust prompt' };

const liveValue = row['live-mode'] || row['Live Mode'] || row['livemode'] || '';
const isLive = String(liveValue).trim().toUpperCase() === 'TRUE';

const GLOBAL_SUFFIX = 'Centered merch graphic, transparent background, print-ready.';
const finalPrompt = `${robustPrompt}\n\nTechnical Specs: ${GLOBAL_SUFFIX}`;

const imageSize = clean(row.size) || '512x512';

return {
  ...row,
  id: idStr,
  rowid: idStr,
  processedPrompt: finalPrompt,
  phrase,
  request: {
    id: idStr,
    prompt: finalPrompt,
    phrase,
    mock: isLive ? false : true,
    size: imageSize,
    mockAssets: ['mock_image.png'],
    title: row.title
  }
};
```

**New `jsCode`** (full replacement):

```javascript
const row = $json || {};
const clean = (v) => (v !== undefined && v !== null ? String(v).trim() : '');

const idStr = clean(row.rowId || row.id);

// Extract text from GPT output (handles both string and structured object formats)
function extractGptText(output) {
  if (!output) return '';
  if (typeof output === 'string') return output.trim();
  if (Array.isArray(output)) {
    const msg = output[0];
    if (msg?.content?.[0]?.text) return msg.content[0].text.trim();
    if (msg?.text) return String(msg.text).trim();
  }
  return '';
}

const rawText = extractGptText(row.output);
const gptRespondedSuccessfully = rawText.length > 0;

// Split off the trailing "PHRASE: ..." line the GPT prompt now appends, so the
// on-design phrase is composited separately (Recraft can't render legible
// text) instead of being baked into the art prompt itself.
function splitPhrase(text) {
  const match = text.match(/\n?PHRASE:\s*(.*)\s*$/i);
  if (!match) return { prompt: text, phrase: '' };
  const phraseValue = match[1].trim();
  const prompt = text.slice(0, match.index).trim();
  return { prompt, phrase: phraseValue.toUpperCase() === 'NONE' ? '' : phraseValue };
}

const { prompt: robustPrompt, phrase: gptPhrase } = splitPhrase(rawText);

// Sheet-column precedence: explicit sheet text always wins over GPT's own
// suggestion; the "none" sentinel forces no phrase even if GPT would have
// invented one. A blank sheet cell defers to GPT's judgment.
const sheetPhrase = clean(row.phrase);
const isNoneSentinel = sheetPhrase.toLowerCase() === 'none';

let phrase;
let phraseWriteBack;
if (sheetPhrase && !isNoneSentinel) {
  phrase = sheetPhrase;
  phraseWriteBack = sheetPhrase;
} else if (isNoneSentinel) {
  phrase = '';
  phraseWriteBack = 'none';
} else if (!gptRespondedSuccessfully) {
  // Blank cell + GPT produced nothing usable: technical hiccup, not a real
  // "no phrase" judgment. Leave the sheet untouched so the row can retry.
  phrase = '';
  phraseWriteBack = sheetPhrase; // stays blank
} else {
  // Blank cell, GPT responded: defer to GPT's judgment. Write back "none"
  // when GPT decided nothing fits, so a blank cell always means "not yet
  // run," never "ran and decided nothing."
  phrase = gptPhrase;
  phraseWriteBack = gptPhrase || 'none';
}

// Both early-return error paths must still carry phraseWriteBack — otherwise
// "Update row in sheet" would receive `undefined` for $json.phraseWriteBack
// and write an empty string, silently wiping out a manually-set phrase on a
// row that errored for an unrelated reason (missing ID / bad prompt).
if (!idStr) return { ...row, error: 'Missing ID for matching', phraseWriteBack };
if (!robustPrompt) return { ...row, error: 'AI failed to generate a robust prompt', phraseWriteBack };

const liveValue = row['live-mode'] || row['Live Mode'] || row['livemode'] || '';
const isLive = String(liveValue).trim().toUpperCase() === 'TRUE';

const GLOBAL_SUFFIX = 'Centered merch graphic, transparent background, print-ready.';
const finalPrompt = `${robustPrompt}\n\nTechnical Specs: ${GLOBAL_SUFFIX}`;

const imageSize = clean(row.size) || '512x512';

return {
  ...row,
  id: idStr,
  rowid: idStr,
  processedPrompt: finalPrompt,
  phrase,
  phraseWriteBack,
  request: {
    id: idStr,
    prompt: finalPrompt,
    phrase,
    mock: isLive ? false : true,
    size: imageSize,
    mockAssets: ['mock_image.png'],
    title: row.title
  }
};
```

## 3. "Update row in sheet" node — add write-back

**Current `columns.value`** (verified live, 2026-07-15):

```json
{
  "id": "={{ $json.id }}",
  "rowId": "={{ $json.rowId }}",
  "n8n_status": "={{ $json.n8n_status }}",
  "n8n_error": "={{ $json.n8n_error }}",
  "assetIds": "={{ $json.assetIds }}",
  "imageUrl": "={{ $json.imageUrl }}",
  "firebaseProductId": "={{ $json.firebaseProductId }}",
  "published": "={{ $json.published }}",
  "lastRun": "={{ $json.lastRun }}",
  "retryCount": "={{ $json.retryCount }}"
}
```

**New `columns.value`** (add one key):

```json
{
  "id": "={{ $json.id }}",
  "rowId": "={{ $json.rowId }}",
  "n8n_status": "={{ $json.n8n_status }}",
  "n8n_error": "={{ $json.n8n_error }}",
  "assetIds": "={{ $json.assetIds }}",
  "imageUrl": "={{ $json.imageUrl }}",
  "firebaseProductId": "={{ $json.firebaseProductId }}",
  "published": "={{ $json.published }}",
  "lastRun": "={{ $json.lastRun }}",
  "retryCount": "={{ $json.retryCount }}",
  "phrase": "={{ $json.phraseWriteBack }}"
}
```

Also add a matching entry to `columns.schema` (same shape as the existing `title` entry, which is the closest analog — a plain string column):

```json
{
  "id": "phrase",
  "displayName": "phrase",
  "required": false,
  "defaultMatch": false,
  "display": true,
  "type": "string",
  "canBeUsedToMatch": true
}
```

Write-back outcomes, per row:

- Explicit text you authored → written back unchanged (no-op, confirms it was used).
- Blank + GPT invented a phrase → sheet now shows what was actually composited.
- Blank + GPT decided nothing fits, or explicit `"none"` → sheet shows `"none"`.
- Blank + GPT produced no usable output at all (extraction failure) → sheet stays blank, eligible for retry.
- Row errored before reaching the prompt/phrase step (missing ID, empty prompt) → sheet's `phrase` cell is left as whatever `phraseWriteBack` already resolved to (never wiped to blank by an `undefined` template value).

## 4. "Message a model1" and "Generate assets" nodes — no changes

Both already do exactly what this feature needs: GPT already emits `PHRASE: <text>`/`PHRASE: NONE`, and the HTTP node already forwards `$json.phrase` (set by `Build Request`) to the API. Confirmed by direct inspection of the live workflow JSON on 2026-07-15.

## 5. `CLAUDE.md` documentation

The Products sheet column list in `CLAUDE.md` needs `phrase` added (currently not listed). Also worth a short note in the n8n Automation Layer section that GPT's phrase decision is only a suggestion the sheet can override — the current docs don't mention the `PHRASE:`/`NONE` convention at all, which is itself part of the drift this investigation uncovered.

---

## Rollout / Testing

1. Add the `phrase` header to the live sheet (manual edit, blank for all existing rows initially).
2. Apply the `Build Request` and `Update row in sheet` node changes to the live workflow via the n8n REST API (`PUT /api/v1/workflows/HlxK50rV54KSiNRD`, following the existing pattern in `apps/frontend/ops/n8n-update-workflow.mjs` — GET, locate node by name, replace its `parameters`, PUT back only the API-accepted fields: `name, nodes, connections, settings, staticData`).
3. Manually set up three test rows to cover all three states:
   - One row with an explicit phrase.
   - One row with `"none"`.
   - One row left blank (GPT judgment).
4. Run each individually (`n8n_status=todo`), inspect the `Build Request` node's output panel to confirm `phrase` and `phraseWriteBack` resolve as expected in each case.
5. Confirm the sheet write-back lands correctly for all three cases.
6. Spot-check the resulting Firestore asset's `phrase` field and the composited (or non-composited) image before considering this done.

## Out of scope

- Auditing existing `typography-humor` rows for the row-354-style concept bug (separate open item, tracked independently).
- The shrink-fallback visual tradeoff (unaffected by this change).
- Any app-side (`route.ts`, `textOverlay.ts`) code changes — none required; confirmed unchanged from prior investigation.
- Rewriting `Message a model1`'s prompt language — its existing `PHRASE:`/`NONE` convention already works and needs no changes for this feature.
