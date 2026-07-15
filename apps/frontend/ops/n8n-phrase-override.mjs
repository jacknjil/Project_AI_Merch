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
