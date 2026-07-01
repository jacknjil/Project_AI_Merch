#!/usr/bin/env node
/**
 * Patches the Master parse response node in the AI_Merch batch workflow
 * to fix originalRow = {} bug (retryCount never increments).
 *
 * Usage:
 *   N8N_API_KEY=<key> node ops/n8n-update-workflow.mjs [--dry-run]
 */

const BASE_URL    = process.env.N8N_BASE_URL || 'https://n8n.jjrsguide.com';
const WORKFLOW_ID = 'HlxK50rV54KSiNRD';
const NODE_NAME   = 'Master parse response';
const DRY_RUN     = process.argv.includes('--dry-run');

// Accept key via env var or --key=xxx CLI arg
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

const FIXED_CODE = `let totalGenerated = 0;
const results = [];
const allItems = $input.all();

for (let i = 0; i < allItems.length; i++) {
  const item = allItems[i].json;
  const data = item.json ? item.json : item;

  const isSuccess = (data.assets && data.assets.length > 0);
  if (isSuccess) totalGenerated++;

  const originalRow = $('Build Request').all()[i]?.json ?? {};
  const prevRetryCount = parseInt(originalRow.retryCount) || 0;

  const mappedRow = {
    rowId:             data.rowId || originalRow.rowId,
    id:                data.id || data.rowId || originalRow.id,
    n8n_status:        isSuccess ? "done" : "error",
    n8n_error:         isSuccess ? "" : "No assets returned",
    assetIds:          (data.assets && data.assets[0]) ? data.assets[0].assetId : "",
    imageUrl:          (data.assets && data.assets[0]) ? data.assets[0].imageUrl : "",
    firebaseProductId: data.firebaseProductId || "",
    published:         false,
    lastRun:           new Date().toISOString(),
    retryCount:        prevRetryCount + 1
  };

  results.push({ json: mappedRow });
}

return results;`;

async function main() {
  console.log(`Fetching workflow ${WORKFLOW_ID}...`);
  const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);

  const nodeIndex = workflow.nodes.findIndex(n => n.name === NODE_NAME);
  if (nodeIndex === -1) {
    console.error(`Node "${NODE_NAME}" not found`);
    process.exit(1);
  }

  const node = workflow.nodes[nodeIndex];
  const oldCode = node.parameters.jsCode;

  if (oldCode === FIXED_CODE) {
    console.log('Nothing to do — code is already up to date.');
    process.exit(0);
  }

  console.log(`\nNode found: "${NODE_NAME}" (index ${nodeIndex})`);
  console.log('Applying fix: originalRow = {} → $(\'Build Request\').all()[i]?.json ?? {}');

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would update node. Pass without --dry-run to apply.');
    process.exit(0);
  }

  workflow.nodes[nodeIndex] = {
    ...node,
    parameters: { ...node.parameters, jsCode: FIXED_CODE },
  };

  // n8n PUT only accepts these fields; strip binaryMode and other internal props
  const { binaryMode, ...safeSettings } = workflow.settings ?? {};
  const payload = {
    name:        workflow.name,
    nodes:       workflow.nodes,
    connections: workflow.connections,
    settings:    safeSettings,
    staticData:  workflow.staticData ?? null,
  };

  console.log('\nPushing update...');
  await n8nPut(`/workflows/${WORKFLOW_ID}`, payload);
  console.log('✓ Workflow updated successfully.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
