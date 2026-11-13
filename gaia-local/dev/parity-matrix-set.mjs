#!/usr/bin/env node
// Edit rows of .local/notes/parity-matrix.md in place and keep its Summary and headline counts true.
//
//   node parity-matrix-set.mjs status <missing|decide|in progress|done|different|n/a> <ID|PREFIX-*>... [--note "<text>"]
//   node parity-matrix-set.mjs note <ID|PREFIX-*>... --note "<text>"
//   node parity-matrix-set.mjs evidence <main|0.25|0.25.4|code> <ID|PREFIX-*>...
//   node parity-matrix-set.mjs since <0.25|0.25.4|0.26> <ID|PREFIX-*>... [--note "<why>"]
//   node parity-matrix-set.mjs summary        (recompute the Summary table and the headline only)
//
// A trailing -* selects every row with that prefix (FR-* is every FR row, FR-CHECK-* only those).
// --note appends "; <text>" to the row's Notes. --if <status> touches only rows currently in that
// status (e.g. `status missing FR-* --if decide` leaves the n/a engine-installer rows alone).
// Every command ends by recomputing the summary.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = '/Users/rapuckett/Projects/gaia/.local/notes/parity-matrix.md';
const STATUSES = ['missing', 'decide', 'in progress', 'done', 'different', 'n/a'];
const ROW = /^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/;
const COL = { status: 2, since: 3, evidence: 5, notes: 10 }; // cell indexes in the 11-column matrix tables

const split = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const join = (cells) => `| ${cells.join(' | ')} |`;

function parseArgs(argv) {
  const out = { cmd: argv[0], rest: [], note: null, only: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--note') out.note = argv[++i];
    else if (argv[i] === '--if') out.only = argv[++i];
    else out.rest.push(argv[i]);
  }
  if (out.only && !STATUSES.includes(out.only)) throw new Error(`--if must be one of: ${STATUSES.join(', ')}`);
  return out;
}

function matcher(selectors) {
  return (id) =>
    selectors.some((s) => (s.endsWith('-*') ? id.startsWith(s.slice(0, -1)) && /\d/.test(id.slice(s.length - 1)) : id === s));
}

// --if <status> limits a command to rows currently in that status.
function edit(lines, selectors, fn, only = null) {
  const match = matcher(selectors);
  const seen = new Set();
  const out = lines.map((line) => {
    const m = line.match(ROW);
    if (!m || m[1].startsWith('SEC-') || !match(m[1])) return line;
    const cells = split(line);
    if (cells.length !== 11) throw new Error(`${m[1]}: expected 11 cells, found ${cells.length}`);
    if (only && cells[COL.status] !== only) return line;
    seen.add(m[1]);
    fn(cells);
    return join(cells);
  });
  const why = only ? ` in status "${only}"` : '';
  for (const s of selectors) {
    if (!s.endsWith('-*') && !seen.has(s)) throw new Error(`no matrix row ${s}${why}`);
    if (s.endsWith('-*') && ![...seen].some((id) => id.startsWith(s.slice(0, -1)))) throw new Error(`no rows match ${s}${why}`);
  }
  return { out, count: seen.size };
}

function summarize(lines) {
  const areas = [];
  let area = null;
  for (const line of lines) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      area = { title: h[1], counts: Object.fromEntries(STATUSES.map((s) => [s, 0])), rows: 0 };
      areas.push(area);
      continue;
    }
    const m = line.match(ROW);
    if (m && area && !m[1].startsWith('SEC-')) {
      const st = split(line)[COL.status];
      if (!(st in area.counts)) throw new Error(`${m[1]}: unknown status "${st}"`);
      area.counts[st]++;
      area.rows++;
    }
  }
  const withRows = areas.filter((a) => a.rows);
  const total = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let rows = 0;
  const table = ['| Area | Rows | done | in progress | missing | decide | different | n/a |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const a of withRows) {
    rows += a.rows;
    for (const s of STATUSES) total[s] += a.counts[s];
    const c = a.counts;
    table.push(`| ${a.title} | ${a.rows} | ${c.done} | ${c['in progress']} | ${c.missing} | ${c.decide} | ${c.different} | ${c['n/a']} |`);
  }
  const t = total;
  table.push(`| **All** | **${rows}** | **${t.done}** | **${t['in progress']}** | **${t.missing}** | **${t.decide}** | **${t.different}** | **${t['n/a']}** |`);
  const targets = rows - t['n/a'];
  const pct = targets ? Math.floor((100 * t.done) / targets) : 0;
  const start = lines.findIndex((l) => l === '## Summary');
  const tStart = lines.findIndex((l, i) => i > start && l.startsWith('| Area |'));
  let tEnd = tStart;
  while (tEnd < lines.length && lines[tEnd].startsWith('|')) tEnd++;
  lines.splice(tStart, tEnd - tStart, ...table);
  const head = lines.findIndex((l) => l.startsWith('**Parity: '));
  const decideText = t.decide ? ` ${t.decide} rows wait on a decision from Rich.` : '';
  lines[head] =
    `**Parity: ${t.done} of ${targets} target rows done (${pct}%).** ${t['in progress']} in progress, ${t.missing} missing, ${t.different} different on purpose.${decideText} ${t['n/a']} desktop-shell rows have no phone counterpart and aren't counted.`;
  return { lines, rows, targets, total: t };
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  let lines = readFileSync(FILE, 'utf8').split('\n');
  let changed = 0;
  if (a.cmd === 'status') {
    const [status, ...ids] = a.rest;
    if (!STATUSES.includes(status)) throw new Error(`status must be one of: ${STATUSES.join(', ')}`);
    ({ out: lines, count: changed } = edit(lines, ids, (c) => {
      c[COL.status] = status;
      if (a.note) c[COL.notes] = c[COL.notes] ? `${c[COL.notes]}; ${a.note}` : a.note;
    }, a.only));
  } else if (a.cmd === 'note') {
    if (!a.note) throw new Error('note needs --note "<text>"');
    ({ out: lines, count: changed } = edit(lines, a.rest, (c) => {
      c[COL.notes] = c[COL.notes] ? `${c[COL.notes]}; ${a.note}` : a.note;
    }, a.only));
  } else if (a.cmd === 'evidence') {
    const [ev, ...ids] = a.rest;
    ({ out: lines, count: changed } = edit(lines, ids, (c) => {
      c[COL.evidence] = ev;
    }, a.only));
  } else if (a.cmd === 'since') {
    const [version, ...ids] = a.rest;
    if (!['0.25', '0.25.4', '0.26'].includes(version)) throw new Error('since must be 0.25, 0.25.4 or 0.26');
    ({ out: lines, count: changed } = edit(lines, ids, (c) => {
      c[COL.since] = version;
      if (a.note) c[COL.notes] = c[COL.notes] ? `${c[COL.notes]}; ${a.note}` : a.note;
    }, a.only));
  } else if (a.cmd !== 'summary') {
    throw new Error('usage: status|note|evidence|since|summary (see the header comment)');
  }
  const s = summarize(lines);
  writeFileSync(FILE, s.lines.join('\n'));
  console.log(`${changed} rows changed; ${s.total.done}/${s.targets} done, ${s.total.missing} missing, ${s.total.decide} decide, ${s.total.different} different, ${s.total['n/a']} n/a`);
}

main();
