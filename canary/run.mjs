// Pushes two invented statements through the built CLI into a real, empty
// Actual sync server and checks the result. Run by the scheduled canary
// workflow against the newest Actual API and server; see .github/workflows.
//
// Needs `npm run build` first and a sync server at CANARY_SERVER_URL (default
// http://localhost:5006). Only throwaway data and a throwaway password are
// used.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as api from '@actual-app/api';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '..', 'dist', 'cli.js');
const serverURL = process.env.CANARY_SERVER_URL ?? 'http://localhost:5006';
const password = 'canary-throwaway-password';
const work = mkdtempSync(join(tmpdir(), 'india2actual-canary-'));

const failures = [];

function check(name, ok, detail = '') {
  const suffix = ok || !detail ? '' : `: ${detail}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${suffix}`);
  if (!ok) {
    failures.push(name);
  }
}

/** A fresh server has no password until the first client sets one. */
async function bootstrapServer() {
  const status = await fetch(`${serverURL}/account/needs-bootstrap`);
  const { data } = await status.json();
  if (!data?.bootstrapped) {
    const response = await fetch(`${serverURL}/account/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      throw new Error(`Setting the server password failed: ${response.status}`);
    }
  }
}

async function withBudget(label, syncId, action) {
  const dataDir = join(work, label);
  mkdirSync(dataDir, { recursive: true });
  await api.init({ dataDir, serverURL, password });
  try {
    if (syncId) {
      await api.downloadBudget(syncId);
    }
    return await action();
  } finally {
    await api.shutdown();
  }
}

async function createBudget() {
  return withBudget('setup', null, async () => {
    await api.runImport('Canary', async () => {});
    await api.createAccount({ name: 'Canary Savings' }, 5_000_000);
    await api.createAccount({ name: 'Canary Card' }, 0);
    await api.sync();
    const budgets = await api.getBudgets();
    const budget = budgets.find(item => item.name === 'Canary');
    if (!budget?.groupId) {
      throw new Error('The new budget did not come back from getBudgets()');
    }
    return budget.groupId;
  });
}

function push(syncId, file, account, transferTo, extra = []) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      join(here, file),
      '--push',
      '--account',
      account,
      '--transfer-to',
      transferTo,
      ...extra,
    ],
    {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...process.env,
        ACTUAL_SERVER_URL: serverURL,
        ACTUAL_PASSWORD: password,
        ACTUAL_SYNC_ID: syncId,
        ACTUAL_DATA_DIR: join(work, 'cli-cache'),
      },
    },
  );
  check(
    `push ${file} into ${account}`,
    result.status === 0,
    `exit ${result.status}\n${result.stderr}${result.stdout}`,
  );
}

async function readState(syncId, label) {
  return withBudget(label, syncId, async () => {
    const accounts = await api.getAccounts();
    const state = {};
    for (const account of accounts) {
      state[account.name] = await api.getTransactions(
        account.id,
        '2025-01-01',
        '2025-12-31',
      );
    }
    return state;
  });
}

function verify(state, round) {
  const savings = state['Canary Savings'] ?? [];
  const card = state['Canary Card'] ?? [];

  check(
    `${round}: savings has 3 transactions`,
    savings.length === 3,
    String(savings.length),
  );
  check(
    `${round}: card has 2 transactions`,
    card.length === 2,
    String(card.length),
  );

  const autopay = savings.find(row => row.amount === -150_000);
  const payment = card.find(row => row.amount === 150_000);
  check(
    `${round}: both sides of the card payment exist`,
    Boolean(autopay && payment),
  );
  check(
    `${round}: the card payment is one linked transfer`,
    Boolean(
      autopay &&
        payment &&
        autopay.transfer_id === payment.id &&
        payment.transfer_id === autopay.id,
    ),
  );
}

async function main() {
  await bootstrapServer();
  const syncId = await createBudget();

  // The card goes first, so its transfer creates the mirror on the bank side,
  // then the bank statement must match that mirror instead of adding a second.
  for (const round of ['first run', 'repeat run']) {
    push(syncId, 'card.csv', 'Canary Card', 'Canary Savings', ['--card']);
    push(syncId, 'bank.csv', 'Canary Savings', 'Canary Card');
    verify(await readState(syncId, round.replace(' ', '-')), round);
  }
}

try {
  await main();
} catch (error) {
  check(
    'canary ran to the end',
    false,
    error instanceof Error ? error.stack : String(error),
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
