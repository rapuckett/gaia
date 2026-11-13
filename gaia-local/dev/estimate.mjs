#!/usr/bin/env node
//
// The sub-agent cost forecaster, shared with agent-host: runs its
// scripts/dev/estimate.mjs (AGENT_HOST_ESTIMATE_SCRIPT overrides the path) with
// this repo's main checkout as the repo, so forecasts and ledger rows go to
// <this main checkout>/.local/ (estimates.jsonl, agent-ledger.tsv), never to
// agent-host's. Arguments and exit status pass through.
//
//   node <main checkout>/.local/dev/estimate.mjs forecast --category <c> --model <m> --record --lane <lane> --task "<task>"
//   node <main checkout>/.local/dev/estimate.mjs actual <id> --agent <agentId> [--outcome ok|failed]

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script =
    process.env.AGENT_HOST_ESTIMATE_SCRIPT ??
    join(homedir(), 'Projects', 'agent-host', 'scripts', 'dev', 'estimate.mjs');
if (!existsSync(script)) {
    process.stderr.write(`estimate: no forecaster at ${script}\n`);
    process.exit(2);
}

const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const common = execFileSync(
    'git',
    ['-C', dirname(fileURLToPath(import.meta.url)), 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8', env }
).trim();

// Central keys repos by the main checkout's folder name; burndown must name it.
const args = process.argv.slice(2);
if (args[0] === 'burndown' && !args.includes('--repo')) args.push('--repo', basename(dirname(common)));

const run = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: { ...env, AGENT_HOST_ESTIMATE_REPO: dirname(common) },
});
process.exit(run.status ?? 1);
