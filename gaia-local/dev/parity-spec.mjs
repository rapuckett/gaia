#!/usr/bin/env node
// Write a builder's spec for one sprint task from its parity-matrix rows.
//
//   node parity-spec.mjs <task-id>      -> .local/notes/mvp-specs/<task-id>.md
//
// One section per row: the feature, its exact labels (quoted from main's catalogs), states, API calls,
// notes and the web reference component, so a builder needs nothing else to know what "done" means.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = '/Users/rapuckett/Projects/gaia';
const SPRINT = `${REPO}/.local/notes/2026-11-12-mobile-parity-sprint.md`;
const MATRIX = `${REPO}/.local/notes/parity-matrix.md`;
const OUT = `${REPO}/.local/notes/mvp-specs`;
const ID = /^[A-Z]+(?:-[A-Z]+)*-\d+[a-z]?$/;
const split = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

function expand(spec) {
  const out = [];
  for (const part of (spec ?? '').split(/,\s*/).map((s) => s.trim()).filter(Boolean)) {
    const r = part.match(/^([A-Z]+(?:-[A-Z]+)*)-(\d+)\.\.\1-(\d+)$/);
    if (r) for (let n = Number(r[2]); n <= Number(r[3]); n++) out.push(`${r[1]}-${String(n).padStart(r[2].length, '0')}`);
    else if (ID.test(part)) out.push(part);
  }
  return out;
}

// main's own screens at phone widths, from Design's fixture audit (widths/<surface>/<width>-<theme>-<locale>.png).
const FIXTURES = `${REPO}/.local/audit/2026-11-12/main-fixtures`;
const REFERENCE = {
  'chat-drawer': ['sidebar-drawer'],
  'chat-new': ['new-chat'],
  'qst-cards': ['waiting-question'],
  'str-bubbles': ['finished-answer', 'running-tool'],
  'str-markdown': ['finished-answer'],
  'str-stream': ['running-tool', 'finished-answer'],
  'cmp-box': ['new-chat', 'model-menu', 'permission-mode-menu'],
};

const task = process.argv[2];
if (!task) throw new Error('usage: parity-spec.mjs <task-id>');
const line = readFileSync(SPRINT, 'utf8').split('\n').find((l) => l.startsWith(`| \`${task}\` |`));
if (!line) throw new Error(`no sprint task ${task}`);
const t = split(line);
const ids = expand(t[10]);
const rows = new Map();
for (const l of readFileSync(MATRIX, 'utf8').split('\n')) {
  const m = l.match(/^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/);
  if (m && ids.includes(m[1])) rows.set(m[1], split(l));
}
const missing = ids.filter((id) => !rows.has(id));
if (missing.length) throw new Error(`rows not in the matrix: ${missing.join(', ')}`);

const o = [];
o.push(`# Spec for \`${task}\` (est ${t[1]}): ${t[2]}`, '');
o.push(`Generated from \`parity-matrix.md\` by \`.local/dev/parity-spec.mjs\`. ${ids.length} rows. These rows are the definition of done: Parity accepts the screen against them, in English and Arabic.`, '');
o.push('- **Labels** are quoted from main\'s web UI catalogs (`src/gaia/apps/webui/src/i18n/locales/en.ts`, key in backticks). Use the same keys through the app\'s `useT`; a label the web UI hard-codes (no key) gets a new key in en.ts and ar.ts, never a literal.');
o.push('- **The web reference** is the component named in each row, under `src/gaia/apps/webui/src/components/`. Read it for behavior, order and states, and build the phone version; don\'t copy its DOM or CSS.');
o.push('- **States** listed for a row must all be reachable and shown. **Notes** say what changes on a phone (hover-only, keyboard-only, desktop-only) and what the reference gets wrong at phone widths (don\'t copy those).', '');
if (REFERENCE[task]) {
  o.push('## Reference shots: main at phone widths', '');
  o.push(`Main's own UI, rendered from the repo's fixtures (Design's audit, \`${FIXTURES}/index.md\`). Files are \`widths/<surface>/<320|390|768|1280>-<light|dark>-<en|ar>.png\`; the contact sheet shows them all.`, '');
  for (const s of REFERENCE[task]) o.push(`- \`${s}\`: \`${FIXTURES}/widths/${s}/\` and \`${FIXTURES}/contact/${s}.png\``);
  o.push('');
}
for (const id of ids) {
  const c = rows.get(id);
  o.push(`## ${id}: ${c[1]}`, '');
  o.push(`- **Labels:** ${c[6] || '—'}`);
  o.push(`- **States:** ${c[7] || '—'}`);
  o.push(`- **API:** ${c[8] || '—'}`);
  o.push(`- **Web reference:** ${c[9] || '—'}`);
  o.push(`- **Since / PC-only / status:** ${c[3]} / ${c[4]} / ${c[2]}`);
  o.push(`- **Notes:** ${c[10] || '—'}`, '');
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${task}.md`, o.join('\n'));
console.log(`wrote ${OUT}/${task}.md: ${ids.length} rows`);
