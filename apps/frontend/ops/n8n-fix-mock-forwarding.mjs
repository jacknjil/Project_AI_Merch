#!/usr/bin/env node
/**
 * Fixes the live-mode / mock switch being a dead no-op: Build Request
 * already computes `request.mock` from the sheet's `live-mode` column, but
 * the "Generate assets" HTTP node's body never included a `mock` field, so
 * the API always saw `body.mock === undefined` regardless of live-mode.
 * Adds the missing body parameter so mock mode actually works.
 *
 * Usage:
 *   N8N_API_KEY=<key> node ops/n8n-fix-mock-forwarding.mjs [--dry-run]
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

const MOCK_PARAM = { name: 'mock', value: '={{ $json.request.mock }}' };

async function main() {
  console.log(`Fetching workflow ${WORKFLOW_ID}...`);
  const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);

  const nodeIndex = workflow.nodes.findIndex(n => n.name === 'Generate assets');
  if (nodeIndex === -1) {
    console.error('Node "Generate assets" not found');
    process.exit(1);
  }

  const node = workflow.nodes[nodeIndex];
  const params = node.parameters.bodyParameters.parameters;
  const alreadyHasMock = params.some(p => p.name === 'mock');

  if (alreadyHasMock) {
    console.log('Nothing to do — "mock" body parameter already present.');
    process.exit(0);
  }

  console.log('\n"Generate assets": will add "mock" body parameter');

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would update workflow. Pass without --dry-run to apply.');
    process.exit(0);
  }

  workflow.nodes[nodeIndex] = {
    ...node,
    parameters: {
      ...node.parameters,
      bodyParameters: {
        ...node.parameters.bodyParameters,
        parameters: [...params, MOCK_PARAM],
      },
    },
  };

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
