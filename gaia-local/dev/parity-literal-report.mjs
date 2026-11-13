#!/usr/bin/env node
// Render the ranked list of visible English literals (from parity-literal-scan.mjs --json) as markdown.
//
//   node parity-literal-scan.mjs --json > hits.json && node parity-literal-report.mjs hits.json
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = '/Users/rapuckett/Projects/gaia/.local/notes/2026-11-12-webui-visible-literals.md';
const NAME = /^(GB|MB|KB|GPU|NPU|CPU|GAIA|Lemonade|Google|Microsoft( 365)?|Fireworks AI|AMD LLM Gateway|AMD|ms|https?:\/\/\S+|Lemonade \$\{.*\}|GB\)|\(\s*GB\s*\))$/;
const TIER = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' };
const esc = (s) => s.replace(/\|/g, '\\|').replace(/`/g, 'ˋ');

const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const HEAD = execFileSync('git', ['-C', '/Users/rapuckett/Projects/gaia', 'rev-parse', '--short', 'HEAD'], { env: ENV, encoding: 'utf8' }).trim();
const hits = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tot = { copy: 0, names: 0 };
const rows = hits
  .map((f) => {
    const names = f.hits.filter((h) => NAME.test(h.text.trim()));
    const copy = f.hits.filter((h) => !NAME.test(h.text.trim()));
    tot.copy += copy.length;
    tot.names += names.length;
    return { ...f, copy, names };
  })
  .filter((f) => f.copy.length || f.names.length)
  .sort((a, b) => a.tier - b.tier || b.p1Rows - a.p1Rows || b.copy.length - a.copy.length);

const by = {};
for (const f of rows) {
  by[f.tier] ??= { files: 0, copy: 0 };
  if (f.copy.length) {
    by[f.tier].files++;
    by[f.tier].copy += f.copy.length;
  }
}
const copyFiles = rows.filter((f) => f.copy.length).length;

const o = [];
o.push('# Visible English that bypasses the i18n catalogs (2026-11-12)', '');
o.push(
  `The Agent UI at \`${HEAD}\` (the main checkout) shows **${tot.copy} English strings in ${copyFiles} files** that skip \`en.ts\` and \`ar.ts\`, so the Arabic UI shows them in English and the phone app can't reuse them (Rich's reuse rule). Another ${tot.names} are names, units or URLs, which belong in constants rather than the catalogs. Files are ranked by when the phone app needs them: the backlog tier of the matrix rows that cite each file, then how many P1 rows use it.`,
  '',
);
o.push('| Tier | Files | Strings to move |', '| --- | --- | --- |');
for (const t of [1, 2, 3, 4]) if (by[t]) o.push(`| ${TIER[t]} | ${by[t].files} | ${by[t].copy} |`);
o.push('', '## Ranked list', '');
o.push('| # | File | Tier | P1 rows | Strings | Names/units | Examples (line: text) |', '| --- | --- | --- | --- | --- | --- | --- |');
rows.forEach((f, i) => {
  const pick = f.copy.length ? f.copy.slice(0, 3) : f.names.slice(0, 2);
  const ex = pick.map((h) => `${h.line}: "${esc(h.text.slice(0, 70))}"`).join('; ');
  o.push(`| ${i + 1} | \`${f.file}\` | ${TIER[f.tier]} | ${f.p1Rows} | ${f.copy.length} | ${f.names.length} | ${ex} |`);
});
o.push('', '## How this was found', '');
o.push(
  '- `node /Users/rapuckett/Projects/gaia/.local/dev/parity-literal-scan.mjs` (add `--json` for every hit with its line). It parses each `.tsx` and `.ts` under `src/gaia/apps/webui/src` (tests and the catalogs excluded) with TypeScript and collects JSX text, user-facing attributes (`title`, `aria-label`, `placeholder`, `alt`, `label`…), strings passed to message setters and toasts, label-like object properties, and a lower-confidence catch-all for sentence-like strings outside logs, thrown errors, tests, class names and lookups.',
);
o.push(
  '- A sample of the catch-all was almost all real copy; expect a few strays. English used only as lookup keys is excluded (`utils/sessionGrouping.ts` and the Sidebar group map translate through the catalog).',
);
o.push(
  "- Not covered: strings the backend sends for display (error details, notices), which reach the phone too. The Electron shell's English (`.cjs`) doesn't matter for the phone.",
);
o.push(
  '- A sentence split around a value (`Download of` … `failed.` in ConnectionBanner) counts once per fragment but is one message: give it one key with a `{placeholder}`, not one key per fragment.',
);
o.push('- When the change lands, re-running the scanner is the check: every remaining hit should be a name, unit or URL that comes from a constant.', '');
writeFileSync(OUT, o.join('\n'));
console.log(`wrote ${OUT}: ${tot.copy} strings in ${copyFiles} files, ${tot.names} names/units`);
for (const t of [1, 2, 3, 4]) if (by[t]) console.log(`${TIER[t]}: ${by[t].files} files, ${by[t].copy} strings`);
rows.slice(0, 12).forEach((f, i) => console.log(`${i + 1}. ${f.file} ${TIER[f.tier]} p1=${f.p1Rows} strings=${f.copy.length} names=${f.names.length}`));
