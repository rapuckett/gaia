#!/usr/bin/env node
// Refine the matrix's Since column for rows marked 0.26: if every i18n key a row quotes exists in
// v0.25.4's en.ts, the feature shipped in 0.25.4 (Rich's desktop from 2026-11-12). Rows that quote
// no key are left as they are and counted, so a person can check them by component.
//
//   node parity-since-0254.mjs [--write]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const REPO = '/Users/rapuckett/Projects/gaia';
const FILE = `${REPO}/.local/notes/parity-matrix.md`;
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const en0254 = execFileSync('git', ['show', 'v0.25.4:src/gaia/apps/webui/src/i18n/locales/en.ts'], { cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 64 << 20 });
const keys0254 = new Set([...en0254.matchAll(/^ {4}'([^']+)':/gm)].map((m) => m[1]));
const enMain = readFileSync(`${REPO}/src/gaia/apps/webui/src/i18n/locales/en.ts`, 'utf8');
const keysMain = new Set([...enMain.matchAll(/^ {4}'([^']+)':/gm)].map((m) => m[1]));

// All of v0.25.4's web UI source as one string, for labels that upstream hard-codes.
const tree0254 = execFileSync('sh', ['-c', 'git archive v0.25.4 src/gaia/apps/webui/src | tar -xO'], { cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 256 << 20 });
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ');
const text0254 = norm(tree0254);

const ROW = /^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/;
const split = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const tally = { shipped: 0, newer: 0, noKeys: 0 };
const lines = readFileSync(FILE, 'utf8').split('\n').map((line) => {
  const m = line.match(ROW);
  if (!m || m[1].startsWith('SEC-')) return line;
  const c = split(line);
  if (c[3] !== '0.26') return line;
  // Keys quoted in the label cell, e.g. (`sidebar.label`); plural pairs end in .one / .other.
  const keys = [...c[6].matchAll(/`([a-z][\w]*(?:\.[\w-]+)+)`/g)].map((k) => k[1]).filter((k) => keysMain.has(k) || keysMain.has(`${k}.one`));
  let inOld;
  if (keys.length) {
    inOld = keys.every((k) => keys0254.has(k) || keys0254.has(`${k}.one`));
  } else {
    // No key quoted: use the quoted English labels. Template parts in {braces} are dropped first,
    // so "Allow {tool}?" is looked up as its two literal pieces.
    const quoted = [...c[6].matchAll(/"([^"]{4,})"/g)].map((q) => norm(q[1]));
    const pieces = quoted.flatMap((q) => q.split(/\{[^}]*\}/).map((p) => p.trim()).filter((p) => p.length >= 4));
    if (!pieces.length) {
      tally.noKeys++;
      return line;
    }
    const found = pieces.filter((p) => text0254.includes(p)).length;
    if (found === pieces.length) inOld = true;
    else if (found === 0) inOld = false;
    else {
      tally.mixed = (tally.mixed ?? 0) + 1; // the feature existed but its copy changed: leave it for a person
      return line;
    }
  }
  if (inOld) {
    tally.shipped++; if (process.argv.includes("--explain")) console.log("SHIPPED", m[1]);
    c[3] = '0.25.4';
    return `| ${c.join(' | ')} |`;
  }
  tally.newer++; if (process.argv.includes("--explain")) console.log("NEWER", m[1]);
  return line;
});
console.log(`0.26 rows: ${tally.shipped} shipped in 0.25.4, ${tally.newer} newer than 0.25.4, ${tally.mixed ?? 0} mixed (copy changed; unchanged), ${tally.noKeys} quote nothing to check (unchanged)`);
if (process.argv.includes('--write')) {
  writeFileSync(FILE, lines.join('\n'));
  console.log('matrix updated');
}
