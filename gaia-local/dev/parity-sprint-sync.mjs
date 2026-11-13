#!/usr/bin/env node
// Keep the parity matrix in step with the mobile-parity sprint: rows go `in progress` when their task is
// dispatched, get a "landed" note when its branch merges into integration/rapuckett, and become `done` only
// through acceptance (parity-acceptance.md). Also says which acceptance tasks are ready.
//
//   node parity-sprint-sync.mjs [--fetch] [--write]
//
// Without --write it only prints the plan. Landings are merge commits "Merge <branch> into
// integration/rapuckett" whose branch is <lane>/<task> (or ends in /<task>); .local/notes/parity-landed-map.tsv
// (branch<TAB>task, one per line) maps any other branch name.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const REPO = '/Users/rapuckett/Projects/gaia';
const SPRINT = `${REPO}/.local/notes/2026-11-12-mobile-parity-sprint.md`;
const MATRIX = `${REPO}/.local/notes/parity-matrix.md`;
const MAP = `${REPO}/.local/notes/parity-landed-map.tsv`;
const SET = `${REPO}/.local/dev/parity-matrix-set.mjs`;
const BASE = '7a6e05c2f';
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 64 << 20 });
const split = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const ID = /^[A-Z]+(?:-[A-Z]+)*-\d+[a-z]?$/;

function expand(spec) {
  const out = [];
  for (const part of (spec ?? '').split(/,\s*/).map((s) => s.trim()).filter(Boolean)) {
    const r = part.match(/^([A-Z]+(?:-[A-Z]+)*)-(\d+)\.\.\1-(\d+)$/);
    if (r) for (let n = Number(r[2]); n <= Number(r[3]); n++) out.push(`${r[1]}-${String(n).padStart(r[2].length, '0')}`);
    else if (ID.test(part)) out.push(part);
  }
  return out;
}

function sprintTasks() {
  const tasks = new Map();
  let epic = null;
  for (const line of readFileSync(SPRINT, 'utf8').split('\n')) {
    const h = line.match(/^### (.+?) \(\d+ tasks/);
    if (h) epic = h[1];
    const t = line.match(/^\| `([a-z0-9-]+)` \| ([0-9a-f]{8}) \|/);
    if (t && epic) {
      const c = split(line);
      tasks.set(t[1], { id: t[1], est: t[2], lane: c[3], epic, rows: expand(c[10]) });
    }
  }
  return tasks;
}

function burndown() {
  const j = JSON.parse(run('node', [`${REPO}/.local/dev/estimate.mjs`, 'burndown', '--sprint', 'mobile-parity', '--json']));
  return new Map(j.items.map((i) => [i.id, i]));
}

let branchMap = null;
// <lane>/<task>, or the task without its epic prefix or a trailing -land (design/strings-p2 is prq-strings-p2),
// or a line in parity-landed-map.tsv.
function taskForBranch(name, tasks) {
  if (!branchMap) {
    branchMap = new Map();
    if (existsSync(MAP)) {
      for (const l of readFileSync(MAP, 'utf8').split('\n')) {
        const [branch, task] = l.split('\t').map((s) => s?.trim());
        if (branch && task && !branch.startsWith('#')) branchMap.set(branch, task);
      }
    }
  }
  if (branchMap.has(name)) return branchMap.get(name);
  const tail = name.split('/').pop();
  if (tasks.has(tail)) return tail;
  // Short forms only when exactly one task fits (set-shell and mem-shell would both be "shell").
  const fits = [...tasks.keys()].filter((id) => {
    const short = id.replace(/^[a-z0-9]+-/, '');
    return tail === short || tail === id.replace(/-land$/, '') || tail === short.replace(/-land$/, '');
  });
  return fits.length === 1 ? fits[0] : null;
}

function landed(tasks) {
  const out = new Map();
  const unmatched = [];
  const log = run('git', ['log', '--merges', '--format=%h%x09%s', `${BASE}..origin/integration/rapuckett`]);
  for (const line of log.split('\n').filter(Boolean)) {
    const [sha, subject] = line.split('\t');
    const m = subject.match(/^Merge (\S+) into integration\/rapuckett$/);
    if (!m) continue;
    const branch = m[1];
    const task = taskForBranch(branch, tasks);
    if (task === '-') continue; // mapped as "not a sprint task"
    if (task) out.set(task, sha);
    else unmatched.push(`${sha} ${branch}`);
  }
  return { byTask: out, unmatched };
}

// A task is being built when a branch <lane>/<task> (or one ending in /<task>) exists, locally or on origin.
// The burndown's dispatchedAt is set at planning for every item, so it can't say that.
function building(tasks) {
  const refs = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes/origin']).split('\n').filter(Boolean);
  const out = new Set();
  for (const ref of refs) {
    const name = ref.replace(/^origin\//, '');
    if (!name.includes('/')) continue;
    const task = taskForBranch(name, tasks);
    if (task && task !== '-') out.add(task);
  }
  return out;
}

function matrix() {
  const rows = new Map();
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/);
    if (!m || m[1].startsWith('SEC-')) continue;
    const c = split(line);
    rows.set(m[1], { status: c[2], notes: c[10] });
  }
  return rows;
}

function main() {
  const write = process.argv.includes('--write');
  if (process.argv.includes('--fetch')) run('git', ['fetch', '--quiet', 'origin']);
  const tasks = sprintTasks();
  const items = burndown();
  const { byTask, unmatched } = landed(tasks);
  const inFlight = building(tasks);
  const rows = matrix();
  const plan = []; // [command args, description]
  for (const t of tasks.values()) {
    if (!t.rows.length) continue;
    const item = items.get(t.est);
    const sha = byTask.get(t.id);
    const accept = [...tasks.values()].find((x) => x.epic === t.epic && x.id.endsWith('-accept'))?.id ?? 'rel-parity-sweep';
    if (sha) {
      const marker = `landed ${sha} (${t.id})`;
      const need = t.rows.filter((id) => rows.has(id) && rows.get(id).status !== 'done' && !rows.get(id).notes.includes(marker));
      const toProgress = need.filter((id) => rows.get(id).status === 'missing');
      if (toProgress.length) plan.push([['status', 'in progress', ...toProgress, '--if', 'missing', '--note', `${marker}; awaiting ${accept}`], `${t.id}: ${toProgress.length} rows landed`]);
      const noteOnly = need.filter((id) => rows.get(id).status !== 'missing');
      if (noteOnly.length) plan.push([['note', ...noteOnly, '--note', `${marker}; awaiting ${accept}`], `${t.id}: ${noteOnly.length} rows noted as landed`]);
    } else if (inFlight.has(t.id) && item?.status !== 'cancelled') {
      const marker = `building: ${t.id}`;
      const need = t.rows.filter((id) => rows.get(id)?.status === 'missing' && !rows.get(id).notes.includes(marker));
      if (need.length) plan.push([['status', 'in progress', ...need, '--if', 'missing', '--note', `${marker} (${t.lane})`], `${t.id}: ${need.length} rows building`]);
    }
  }
  // An acceptance task is ready when every other task in its epic that carries rows has landed.
  const ready = [];
  const waiting = [];
  for (const a of [...tasks.values()].filter((x) => x.id.endsWith('-accept'))) {
    const builders = [...tasks.values()].filter((x) => x.epic === a.epic && x.id !== a.id && x.rows.length);
    const open = builders.filter((b) => !byTask.has(b.id)).map((b) => b.id);
    const done = items.get(a.est)?.status === 'done';
    if (done) continue;
    (open.length ? waiting : ready).push(open.length ? `${a.id}: waits on ${open.length} (${open.slice(0, 4).join(', ')}${open.length > 4 ? ', …' : ''})` : a.id);
  }
  console.log(`Landed sprint tasks: ${byTask.size}. Unmatched merges: ${unmatched.length ? unmatched.join('; ') : 'none'}.`);
  console.log(`Matrix changes: ${plan.length ? '' : 'none'}`);
  for (const [, d] of plan) console.log(`- ${d}`);
  console.log(`Acceptance ready: ${ready.length ? ready.join(', ') : 'none'}`);
  for (const w of waiting) console.log(`- ${w}`);
  if (write) for (const [args] of plan) run('node', [SET, ...args]);
  if (write && plan.length) console.log(run('node', [SET, 'summary']).trim());
}

main();
