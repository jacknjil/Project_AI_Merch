# Sheet-Controlled Phrase Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not use subagent-driven-development for this plan** — Tasks 3 and 5 mutate a live production n8n workflow and a live Google Sheet; per this project's own convention (`feedback_live_production_verification` memory), that class of step must run in-session with the user watching, not dispatched blind to a subagent.

**Goal:** Let a row in the Products Google Sheet explicitly author a text-overlay phrase, explicitly suppress one (`"none"`), or defer to GPT's existing per-concept judgment — with the resolved outcome written back to the sheet for review.

**Architecture:** No new nodes and no app-side code changes. One new sheet column (`phrase`) is read automatically by the existing `Get row(s) in sheet` node (no schema restriction there). The existing `Build Request` Code node gains a precedence layer between the sheet's `phrase` cell and GPT's existing `PHRASE:`/`NONE` line. The existing `Update row in sheet` node gains one new mapped column to write the resolved value back.

**Tech Stack:** n8n REST API (`https://n8n.jjrsguide.com/api/v1`), Node.js `fetch`-based ops scripts (matching `apps/frontend/ops/n8n-update-workflow.mjs`), Google Sheets (manual edit for the new column).

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-07-15-sheet-phrase-override-design.md` (approved). Every exact-code block in this plan is copied from that spec — do not deviate from it without going back to the spec first.
- Workflow ID is always `HlxK50rV54KSiNRD`. Node names are exact and case-sensitive: `Build Request`, `Update row in sheet`.
- `PUT /api/v1/workflows/:id` accepts only these top-level fields: `name, nodes, connections, settings, staticData`. Strip everything else (documented in `CLAUDE.md`).
- `N8N_API_KEY` must be supplied via env var at script run time — never hardcode it in any committed file. The key currently lives in `~/.claude/.mcp.json` under `mcpServers.n8n.env.N8N_API_KEY`; read it from there at run time rather than typing it into a terminal command that lands in shell history.
- No automated test suite exists for anything under `apps/frontend/ops/` (confirmed: `n8n-update-workflow.mjs` and `n8n-find-asset.mjs` both ship with zero test files). This plan follows that existing convention — verification is dry-run diffing plus live-execution inspection via the n8n API, not a Jest/Vitest suite. Do not introduce a test framework for a one-off migration script that has no precedent for one in this codebase.
- Every task that touches the live n8n workflow or the live Google Sheet must be run interactively in this session, not delegated to a background subagent.

---

### Task 1: Add the `phrase` column to the Products sheet

**Files:** None (Google Sheets UI edit, no repo file).

**Interfaces:**
- Produces: a `phrase` header column in the Products sheet (`1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM`, `Sheet1`/`gid=164939025`), consumed by Task 5's test rows and, from then on, by every future workflow run.

- [ ] **Step 1: Add the header cell**

Open `https://docs.google.com/spreadsheets/d/1qahisnJg8koBnqmruWLUsvqI3fEHW3AbEen5Y1AYZgM/edit#gid=164939025`. In row 1, find the first empty column after `notes`, and type `phrase` into the header cell. Leave the column blank for all existing rows.

- [ ] **Step 2: Confirm no immediate side effects**

No verification script needed yet — `Get row(s) in sheet` has no column allowlist, so this column becomes readable the moment it exists. It will be exercised for real in Task 5. Do not proceed to Task 2 until this header cell is saved.

---

### Task 2: Write and dry-run the node-update script

**Files:**
- Create: `apps/frontend/ops/n8n-phrase-override.mjs`

**Interfaces:**
- Consumes: `N8N_API_KEY`, `N8N_BASE_URL` (env vars); live workflow `HlxK50rV54KSiNRD` (read-only in this task via `--dry-run`).
- Produces: `NEW_BUILD_REQUEST_CODE` constant and node-patch logic that Task 3 runs for real.

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
/**
 * Adds sheet-column phrase-override precedence to the AI_Merch batch workflow:
 *  - Build Request: sheet `phrase` column overrides GPT's PHRASE: line
 *    ("none" forces empty, blank defers to GPT), plus a write-back value.
 *  - Update row in sheet: writes the resolved phrase back to the sheet.
 *
 * Usage:
 *   N8N_API_KEY=<key> node ops/n8n-phrase-override.mjs [--dry-run]
 */

const BASE_URL    = process.env.N8N_BASE_URL || 'https://n8n.jjrsguide.com';
const WORKFLOW_ID = 'HlxK50rV54KSiNRD';
const DRY_RUN     = process.argv.includes('--dry-run');

const keyArg = process.argv.find(a => a.startsWith('--key='));
const API_KEY = process.env.N8N_API_KEY || (keyArg ? keyArg.split('=').slice(1).join('=') : null);

if (!API_KEY) {
  console.error('Error: provide key via  N8N_API_KEY=<key>  or  --key=<key>');
  process.exit(1);
}

async function n8nGet(path) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': API_KEY },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function n8nPut(path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const NEW_BUILD_REQUEST_CODE = `const row = $json || {};
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
  const match = text.match(/\\n?PHRASE:\\s*(.*)\\s*$/i);
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
// "Update row in sheet" would receive \`undefined\` for $json.phraseWriteBack
// and write an empty string, silently wiping out a manually-set phrase on a
// row that errored for an unrelated reason (missing ID / bad prompt).
if (!idStr) return { ...row, error: 'Missing ID for matching', phraseWriteBack };
if (!robustPrompt) return { ...row, error: 'AI failed to generate a robust prompt', phraseWriteBack };

const liveValue = row['live-mode'] || row['Live Mode'] || row['livemode'] || '';
const isLive = String(liveValue).trim().toUpperCase() === 'TRUE';

const GLOBAL_SUFFIX = 'Centered merch graphic, transparent background, print-ready.';
const finalPrompt = \`\${robustPrompt}\\n\\nTechnical Specs: \${GLOBAL_SUFFIX}\`;

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
};`;

const PHRASE_WRITE_BACK_EXPR = '={{ $json.phraseWriteBack }}';
const PHRASE_SCHEMA_ENTRY = {
  id: 'phrase',
  displayName: 'phrase',
  required: false,
  defaultMatch: false,
  display: true,
  type: 'string',
  canBeUsedToMatch: true,
};

async function main() {
  console.log(`Fetching workflow ${WORKFLOW_ID}...`);
  const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);

  const buildRequestIndex = workflow.nodes.findIndex(n => n.name === 'Build Request');
  const updateRowIndex = workflow.nodes.findIndex(n => n.name === 'Update row in sheet');

  if (buildRequestIndex === -1) {
    console.error('Node "Build Request" not found');
    process.exit(1);
  }
  if (updateRowIndex === -1) {
    console.error('Node "Update row in sheet" not found');
    process.exit(1);
  }

  const buildRequestNode = workflow.nodes[buildRequestIndex];
  const updateRowNode = workflow.nodes[updateRowIndex];

  const buildRequestUnchanged = buildRequestNode.parameters.jsCode === NEW_BUILD_REQUEST_CODE;
  const updateRowValue = updateRowNode.parameters.columns.value;
  const updateRowValueUnchanged = updateRowValue.phrase === PHRASE_WRITE_BACK_EXPR;
  const updateRowSchemaUnchanged = updateRowNode.parameters.columns.schema.some(s => s.id === 'phrase');
  const updateRowUnchanged = updateRowValueUnchanged && updateRowSchemaUnchanged;

  if (buildRequestUnchanged && updateRowUnchanged) {
    console.log('Nothing to do — both nodes are already up to date.');
    process.exit(0);
  }

  console.log(`\nBuild Request: ${buildRequestUnchanged ? 'already up to date' : 'will update jsCode'}`);
  console.log(`Update row in sheet: ${updateRowUnchanged ? 'already up to date' : 'will add phrase mapping'}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would update workflow. Pass without --dry-run to apply.');
    process.exit(0);
  }

  if (!buildRequestUnchanged) {
    workflow.nodes[buildRequestIndex] = {
      ...buildRequestNode,
      parameters: { ...buildRequestNode.parameters, jsCode: NEW_BUILD_REQUEST_CODE },
    };
  }

  if (!updateRowUnchanged) {
    const newValue = updateRowValueUnchanged
      ? updateRowValue
      : { ...updateRowValue, phrase: PHRASE_WRITE_BACK_EXPR };
    const newSchema = updateRowSchemaUnchanged
      ? updateRowNode.parameters.columns.schema
      : [...updateRowNode.parameters.columns.schema, PHRASE_SCHEMA_ENTRY];

    workflow.nodes[updateRowIndex] = {
      ...updateRowNode,
      parameters: {
        ...updateRowNode.parameters,
        columns: { ...updateRowNode.parameters.columns, value: newValue, schema: newSchema },
      },
    };
  }

  const { binaryMode, ...safeSettings } = workflow.settings ?? {};
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: safeSettings,
    staticData: workflow.staticData ?? null,
  };

  console.log('\nPushing update...');
  await n8nPut(`/workflows/${WORKFLOW_ID}`, payload);
  console.log('✓ Workflow updated successfully.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
```

- [ ] **Step 2: Dry-run against the live workflow**

Run (reading the key out of `~/.claude/.mcp.json` at invocation time so it never appears in shell history):

```bash
cd /home/ibjjr/Project_AI_Merch/apps/frontend
N8N_API_KEY=$(python3 -c "import json; print(json.load(open('/home/ibjjr/.claude/.mcp.json'))['mcpServers']['n8n']['env']['N8N_API_KEY'])") \
  node ops/n8n-phrase-override.mjs --dry-run
```

Expected output:
```
Fetching workflow HlxK50rV54KSiNRD...

Build Request: will update jsCode
Update row in sheet: will add phrase mapping

[DRY RUN] Would update workflow. Pass without --dry-run to apply.
```

If either line says "already up to date" unexpectedly, stop and diff `NEW_BUILD_REQUEST_CODE` against the live node's current `jsCode` before proceeding — it means either this script already ran, or the live node changed again since the spec was written.

- [ ] **Step 3: Commit the script**

```bash
git add apps/frontend/ops/n8n-phrase-override.mjs
git commit -m "chore: add n8n phrase-override migration script (dry-run verified)"
```

---

### Task 3: Apply the update to the live workflow and verify

**Files:** None (mutates the live n8n workflow only; no repo changes).

**Interfaces:**
- Consumes: `apps/frontend/ops/n8n-phrase-override.mjs` from Task 2.
- Produces: live `Build Request` and `Update row in sheet` nodes matching the spec, verified by re-fetching the workflow.

- [ ] **Step 1: Run the script for real**

```bash
cd /home/ibjjr/Project_AI_Merch/apps/frontend
N8N_API_KEY=$(python3 -c "import json; print(json.load(open('/home/ibjjr/.claude/.mcp.json'))['mcpServers']['n8n']['env']['N8N_API_KEY'])") \
  node ops/n8n-phrase-override.mjs
```

Expected output ends with `✓ Workflow updated successfully.`

- [ ] **Step 2: Re-fetch and confirm idempotency**

Run the exact same dry-run command from Task 2 Step 2 again. Expected output this time:
```
Fetching workflow HlxK50rV54KSiNRD...
Nothing to do — both nodes are already up to date.
```

If it instead reports pending changes again, the PUT did not persist as expected — stop and inspect the live workflow in the n8n UI before continuing to Task 4.

---

### Task 4: Update `CLAUDE.md` documentation

**Files:**
- Modify: `CLAUDE.md` (Google Sheets Integration section's product columns list, and n8n Automation Layer section)

**Interfaces:** None (documentation only).

- [ ] **Step 1: Add `phrase` to the product columns list**

In `CLAUDE.md`, find the line beginning `- Product columns:` under "Google Sheets Integration" and add `phrase` to the column list (after `notes`, matching actual sheet order from Task 1):

Old:
```
- Product columns: `id`, `rowId`, `title`, `niche`, `concept`, `styleTag`, `colorPalette`, `product_category`, `size`, `priority`, `live-mode`, `n8n_status`, `n8n_error`, `assetIds`, `imageUrl`, `firebaseProductId`, `published`, `lastRun`, `retryCount`, `notes`
```

New:
```
- Product columns: `id`, `rowId`, `title`, `niche`, `concept`, `styleTag`, `colorPalette`, `product_category`, `size`, `priority`, `live-mode`, `n8n_status`, `n8n_error`, `assetIds`, `imageUrl`, `firebaseProductId`, `published`, `lastRun`, `retryCount`, `notes`, `phrase`
```

- [ ] **Step 2: Document the phrase precedence convention**

In the "Key Workflow: AI_Merch - Batch from Sheet" flow summary, after the line describing the GPT prompt-building step (`5. GPT-4.1-mini builds a refined prompt from the concept field`), add a new numbered note (renumber subsequent steps accordingly):

```
5. GPT-4.1-mini builds a refined prompt from the `concept` field, ending with a `PHRASE: <text>` or `PHRASE: NONE` line for the on-design catchphrase
5a. **Build Request** resolves the final phrase with sheet precedence: an explicit `phrase` cell wins outright, `"none"` (case-insensitive) forces no phrase, and a blank cell defers to GPT's `PHRASE:` line. The resolved value is written back to the sheet's `phrase` column (`"none"` if nothing was decided, left blank only on a GPT extraction failure so the row can retry).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document phrase-override precedence and new sheet column"
```

---

### Task 5: End-to-end verification with three live test rows

**Files:** None (live sheet + live workflow execution; read-only verification via n8n API).

**Interfaces:**
- Consumes: Task 1's `phrase` column, Task 3's live node changes.
- Produces: confirmed evidence (execution data + sheet state + Firestore asset) that all three phrase states resolve correctly.

- [ ] **Step 1: Pick or create three test rows**

In the Products sheet, identify three rows with `n8n_status` blank or `todo` (or set three rows to `todo` deliberately with `live-mode` blank/FALSE so they run in mock mode — mock mode is fine here since this only needs to verify `Build Request`'s output, not the actual DALL-E/Recraft generation). Set their `phrase` cells to:
- Row A: an explicit phrase, e.g. `Test Explicit Phrase`
- Row B: `none`
- Row C: leave blank

- [ ] **Step 2: Trigger the workflow**

Run the workflow manually from the n8n UI (`https://n8n.jjrsguide.com`, workflow `AI_Merch - Batch from Sheet`), or via the manual trigger, so all three rows process in this run.

- [ ] **Step 3: Inspect each row's `Build Request` output via the n8n API**

```bash
N8N_API_KEY=$(python3 -c "import json; print(json.load(open('/home/ibjjr/.claude/.mcp.json'))['mcpServers']['n8n']['env']['N8N_API_KEY'])") \
python3 -c "
import json, urllib.request, os

base_url = 'https://n8n.jjrsguide.com'
api_key = os.environ['N8N_API_KEY']
req = urllib.request.Request(
    f'{base_url}/api/v1/executions?workflowId=HlxK50rV54KSiNRD&limit=1&includeData=true',
    headers={'X-N8N-API-KEY': api_key},
)
with urllib.request.urlopen(req, timeout=20) as resp:
    data = json.load(resp)

execution = data['data'][0]
run_data = execution['data']['resultData']['runData']
build_request_runs = run_data.get('Build Request', [])
for i, run in enumerate(build_request_runs):
    items = run['data']['main'][0]
    for item in items:
        j = item['json']
        print(f\"row {j.get('rowId')}: phrase={j.get('phrase')!r} phraseWriteBack={j.get('phraseWriteBack')!r}\")
"
```

Expected: three lines, one per test row, showing:
- Row A: `phrase='Test Explicit Phrase' phraseWriteBack='Test Explicit Phrase'`
- Row B: `phrase='' phraseWriteBack='none'`
- Row C: `phrase=<GPT's own PHRASE: value, or ''> phraseWriteBack=<same value, or 'none' if empty>`

- [ ] **Step 4: Confirm the sheet write-back**

Reload the Products sheet and confirm the `phrase` column for rows A/B/C matches the `phraseWriteBack` values from Step 3.

- [ ] **Step 5: Spot-check one Firestore asset**

For row A (explicit phrase, most deterministic to check), find its `assetIds` value in the sheet after the run, then check the Firestore `assets/{assetId}` doc's `phrase` field matches `"Test Explicit Phrase"`. Use the Firebase console or an existing script pattern (`apps/frontend/ops/firebase-admin/`) — do not write a new script for this single manual check.

- [ ] **Step 6: Clean up test rows**

Reset rows A/B/C's `n8n_status` back to blank (or delete the rows if they were newly created for this test) so they don't linger as permanent test data in the production sheet.

---

## Self-Review Notes

- **Spec coverage:** Section 1 (sheet column) → Task 1. Section 2 (`Build Request` precedence) → Tasks 2–3. Section 3 (`Update row in sheet` write-back) → Tasks 2–3 (same script, same PUT). Section 5 (`CLAUDE.md`) → Task 4. Rollout/testing section → Task 5. All spec sections covered.
- **Placeholder scan:** No TBD/TODO; every step has exact commands or exact code.
- **Type/name consistency:** `phrase` / `phraseWriteBack` field names match exactly between the spec, the script's `NEW_BUILD_REQUEST_CODE`, the `Update row in sheet` mapping (`PHRASE_WRITE_BACK_EXPR`), and the Task 5 verification script.
