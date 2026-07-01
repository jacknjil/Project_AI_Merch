#!/usr/bin/env node
/**
 * Search n8n execution history for a Firestore asset ID.
 * Usage: node ops/n8n-find-asset.mjs <assetId>
 *
 * Set env vars or pass inline:
 *   N8N_BASE_URL=https://n8n.jjrsguide.com N8N_API_KEY=<key> node ops/n8n-find-asset.mjs <assetId>
 */

const BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.jjrsguide.com';
const API_KEY  = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'HlxK50rV54KSiNRD'; // AI_Merch - Batch from Sheet

const TARGET_ASSET_ID = process.argv[2];

if (!API_KEY) {
  console.error('Error: N8N_API_KEY env var required');
  process.exit(1);
}

if (!TARGET_ASSET_ID) {
  console.error('Usage: node ops/n8n-find-asset.mjs <assetId>');
  process.exit(1);
}

async function n8nGet(path) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: { 'X-N8N-API-KEY': API_KEY },
  });
  if (!res.ok) throw new Error(`n8n API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function searchExecutions() {
  console.log(`Searching n8n executions for asset ID: ${TARGET_ASSET_ID}\n`);

  let cursor = undefined;
  let page = 0;
  let found = false;

  while (true) {
    page++;
    const qs = new URLSearchParams({
      workflowId: WORKFLOW_ID,
      limit: '25',
      ...(cursor ? { cursor } : {}),
    });

    const data = await n8nGet(`/executions?${qs}`);
    const executions = data.data ?? [];

    if (executions.length === 0) break;

    console.log(`Page ${page}: checking ${executions.length} executions...`);

    for (const exec of executions) {
      const raw = JSON.stringify(exec);
      if (raw.includes(TARGET_ASSET_ID)) {
        console.log('\n✓ FOUND in execution:');
        console.log(`  Execution ID : ${exec.id}`);
        console.log(`  Status       : ${exec.finished ? 'finished' : 'running'}`);
        console.log(`  Started      : ${exec.startedAt}`);
        console.log(`  Mode         : ${exec.mode}`);

        // Try to extract rowId from the execution data
        const rowIdMatch = raw.match(/"rowId"\s*:\s*"?(\d+)"?/);
        if (rowIdMatch) {
          console.log(`  Sheet rowId  : ${rowIdMatch[1]}`);
        }
        found = true;
      }
    }

    cursor = data.nextCursor;
    if (!cursor) break;
  }

  if (!found) {
    console.log(`\n✗ Asset ID "${TARGET_ASSET_ID}" not found in any execution.`);
    console.log('  Likely reason: n8n purged old execution logs.');
    console.log('  Recommendation: skip this row — fix writeback to prevent future cases.');
  }
}

searchExecutions().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
