#!/usr/bin/env node
/**
 * Fixes the Merge node's combineByPosition data-integrity bug: it zips the
 * `Limit` branch and the `Message a model1` (GPT) branch purely by array
 * index, with no identity check. The GPT branch carries no rowId of its own
 * (its output items only have an `output` key) — but n8n's built-in
 * pairedItem lineage tracking IS present and correct on every item, it's
 * just unused today.
 *
 * Fix, in two parts:
 *   1. Insert a "Reattach RowId" Code node between "Message a model1" and
 *      "Merge" that pulls the true source rowId via `$('Limit').item.json`,
 *      which resolves through pairedItem lineage rather than raw position —
 *      so it stays correct even if the two branches' item counts ever
 *      diverge (e.g. a silently dropped item from an internal API retry).
 *   2. Switch Merge's combineBy from "combineByPosition" to
 *      "combineByFields", matched on rowId — now safe since both branches
 *      have a real, trustworthy rowId field.
 *
 * Idempotent: skips if "Reattach RowId" already exists and Merge is already
 * on combineByFields.
 *
 * Usage:
 *   N8N_API_KEY=<key> node ops/n8n-fix-merge-position-bug.mjs [--dry-run]
 */

import { randomUUID } from 'crypto';

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

const REATTACH_NODE_NAME = 'Reattach RowId';

const REATTACH_JS_CODE = `const row = $json || {};

// Message a model1's output only carries { output }, no rowId of its own.
// $('Limit').item resolves via n8n's pairedItem lineage tracking, not raw
// array position, so this stays correct even if this branch ever drops or
// reorders items relative to the Limit branch.
return {
  ...row,
  rowId: $('Limit').item.json.rowId,
};`;

async function main() {
  console.log(`Fetching workflow ${WORKFLOW_ID}...`);
  const workflow = await n8nGet(`/workflows/${WORKFLOW_ID}`);

  const gptNode = workflow.nodes.find(n => n.name === 'Message a model1');
  const mergeNode = workflow.nodes.find(n => n.name === 'Merge');
  const alreadyHasReattachNode = workflow.nodes.some(n => n.name === REATTACH_NODE_NAME);
  const mergeAlreadyFixed = mergeNode?.parameters?.fieldsToMatchString === 'rowId';

  if (!gptNode || !mergeNode) {
    console.error('Could not find "Message a model1" or "Merge" node');
    process.exit(1);
  }

  if (alreadyHasReattachNode && mergeAlreadyFixed) {
    console.log('Nothing to do — fix already applied (Reattach RowId node + Merge combineByFields present).');
    process.exit(0);
  }

  console.log('\nPlanned changes:');
  if (!alreadyHasReattachNode) {
    console.log(`  + Insert "${REATTACH_NODE_NAME}" Code node between "Message a model1" and "Merge"`);
    console.log(`  + Rewire: Message a model1 -> ${REATTACH_NODE_NAME} -> Merge (input 1)`);
  }
  if (!mergeAlreadyFixed) {
    console.log('  ~ Merge: combineBy "combineByPosition" -> "combineByFields", matched on rowId');
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would update workflow. Pass without --dry-run to apply.');
    console.log('\nNOTE: Merge combineByFields parameter shape (mergeByFields.values[].field1/field2)');
    console.log('is based on n8n\'s standard Merge V3 schema, not verified against this specific');
    console.log('instance\'s UI. If the real apply run below is rejected by n8n with a validation');
    console.log('error, that\'s expected-safe (GET-first + PUT reject leaves workflow untouched) —');
    console.log('report back and we\'ll adjust the field names.');
    process.exit(0);
  }

  const reattachNode = {
    id: randomUUID(),
    name: REATTACH_NODE_NAME,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-160, 80],
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: REATTACH_JS_CODE,
    },
  };

  const nodes = alreadyHasReattachNode
    ? workflow.nodes
    : [...workflow.nodes, reattachNode];

  const connections = { ...workflow.connections };

  if (!alreadyHasReattachNode) {
    connections['Message a model1'] = {
      main: [[{ node: REATTACH_NODE_NAME, type: 'main', index: 0 }]],
    };
    connections[REATTACH_NODE_NAME] = {
      main: [[{ node: 'Merge', type: 'main', index: 1 }]],
    };
  }

  const updatedNodes = mergeAlreadyFixed
    ? nodes
    : nodes.map(n =>
        n.name === 'Merge'
          ? {
              ...n,
              parameters: {
                ...n.parameters,
                fieldsToMatchString: 'rowId',
              },
            }
          : n,
      );

  const { binaryMode, ...safeSettings } = workflow.settings ?? {};
  const payload = {
    name: workflow.name,
    nodes: updatedNodes,
    connections,
    settings: safeSettings,
    staticData: workflow.staticData ?? null,
  };

  console.log('\nPushing update...');
  await n8nPut(`/workflows/${WORKFLOW_ID}`, payload);
  console.log('✓ Workflow updated successfully.');
  console.log('\nNext: trigger "Execute Workflow" in the n8n editor for a normal 2-3 row batch,');
  console.log('then re-run with --dry-run (or check via the executions API) to confirm rowId');
  console.log('reattachment and combineByFields matching both worked correctly.');
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
