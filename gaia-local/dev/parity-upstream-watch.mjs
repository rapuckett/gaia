#!/usr/bin/env node
// Parity's upstream watch: classify what landed on upstream/main since the last check, and diff the
// sources the mobile app must follow (i18n keys, API schemas, shared constants, CSS tokens).
//
//   node parity-upstream-watch.mjs [--fetch] [--from <rev>] [--to <rev>] [--record]
//
// --fetch   git fetch upstream first (read-only; never pushes).
// --from    start of the range (default: lastChecked in upstream-watch-state.json).
// --to      end of the range (default: upstream/main).
// --record  append the report to .local/notes/upstream-watch.md, move lastChecked to --to, and add a
//           note to every matrix row listed under "App rows to update" (parity-matrix-set.mjs note).
//
// The report also maps each changed source to the parity-matrix rows that show it: "App rows to update",
// "Accepted rows to re-check" (the done ones) and "Changes with no matrix row". A change maps by its label
// key (i18n) and by the component files that use it (git grep at --to). At most 300 lookups per run.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/Users/rapuckett/Projects/gaia';
const NOTES = join(REPO, '.local/notes');
const STATE = join(NOTES, 'upstream-watch-state.json');
const LOG = join(NOTES, 'upstream-watch.md');
const W = 'src/gaia/apps/webui';

const SOURCES = {
  i18nEn: `${W}/src/i18n/locales/en.ts`,
  i18nAr: `${W}/src/i18n/locales/ar.ts`,
  schemas: `${W}/src/types/api.schemas.json`,
  constants: `${W}/src/utils/constants.ts`,
  apiBase: `${W}/src/utils/apiBase.ts`,
  css: [`${W}/src/styles/index.css`, `${W}/src/styles/palettes.css`, `${W}/src/styles/motion.css`],
  python: ['src/gaia/config.py', 'src/gaia/llm/lemonade_client.py', 'src/gaia/ui/models.py'],
};

// Scripts that run git clear every inherited GIT_* variable (owner's machine rule).
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const git = (...args) =>
  execFileSync('git', args, { cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
// null when the file doesn't exist at rev (e.g. the i18n catalogs before #6165).
const show = (rev, path) => {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      cwd: REPO, env: ENV, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

function args() {
  const a = process.argv.slice(2);
  const get = (flag) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { fetch: a.includes('--fetch'), record: a.includes('--record'), from: get('--from'), to: get('--to') };
}

// Top-level keys of the catalog object only (`export const enMessages = {` in en.ts,
// `const messages: Messages = {` in ar.ts), not the Locale wrapper after it;
// a key's value is everything up to the next key.
function parseI18n(text) {
  const out = new Map();
  if (!text) return out;
  const start = text.search(/^(?:export )?const \w*[mM]essages\b[^=]*=\s*\{/m);
  if (start < 0) throw new Error('i18n catalog: no `const <x>Messages = {` block; the format changed');
  const body = text.slice(start).split('\n').slice(1);
  const end = body.findIndex((l) => /^\}/.test(l));
  const key = /^ {4}(?:'((?:[^'\\]|\\.)+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/;
  let cur = null;
  let buf = [];
  const flush = () => cur && out.set(cur, buf.join('\n').trim());
  for (const line of body.slice(0, end < 0 ? undefined : end)) {
    const m = line.match(key);
    if (m) {
      flush();
      cur = m[1] ?? m[2] ?? m[3];
      buf = [line.slice(m[0].length)];
    } else if (cur && /^ {5,}\S/.test(line)) {
      buf.push(line.trim());
    } else if (cur && /^\S|^ {0,3}\S/.test(line)) {
      flush();
      cur = null;
      buf = [];
    }
  }
  flush();
  return out;
}

function parseConstants(text) {
  const out = new Map();
  if (!text) return out;
  for (const chunk of text.split(/^export /m).slice(1)) {
    const m = chunk.match(/^(?:const|let|function|type|interface|enum)\s+([A-Za-z_$][\w$]*)/);
    if (m) out.set(m[1], chunk.trim().replace(/\s+/g, ' '));
  }
  return out;
}

function parseCssVars(text) {
  const out = new Map();
  if (!text) return out;
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], [...(out.get(m[1]) ?? []), m[2].trim()]);
  }
  for (const [k, v] of out) out.set(k, v.join(' | '));
  return out;
}

function diffMaps(a, b) {
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  return { added, removed, changed };
}

function diffSchemas(aText, bText) {
  const a = aText ? JSON.parse(aText) : {};
  const b = bText ? JSON.parse(bText) : {};
  const lines = [];
  for (const name of Object.keys(b).filter((n) => !(n in a))) lines.push(`added schema \`${name}\``);
  for (const name of Object.keys(a).filter((n) => !(n in b))) lines.push(`removed schema \`${name}\``);
  for (const name of Object.keys(b).filter((n) => n in a)) {
    const pa = a[name].properties ?? {};
    const pb = b[name].properties ?? {};
    for (const p of Object.keys(pb).filter((p) => !(p in pa))) lines.push(`\`${name}\`: added field \`${p}\``);
    for (const p of Object.keys(pa).filter((p) => !(p in pb))) lines.push(`\`${name}\`: removed field \`${p}\``);
    for (const p of Object.keys(pb).filter((p) => p in pa)) {
      if (JSON.stringify(pa[p]) !== JSON.stringify(pb[p])) lines.push(`\`${name}\`: changed field \`${p}\``);
    }
    if (JSON.stringify(a[name].enum) !== JSON.stringify(b[name].enum)) lines.push(`\`${name}\`: enum changed`);
    if (JSON.stringify(a[name].required ?? []) !== JSON.stringify(b[name].required ?? [])) {
      lines.push(`\`${name}\`: required fields changed`);
    }
  }
  return lines;
}

function pythonNames(from, to, path) {
  let diff = '';
  try {
    diff = git('diff', `${from}..${to}`, '--', path);
  } catch {
    return [];
  }
  const names = new Set();
  for (const line of diff.split('\n')) {
    const m = line.match(/^[+-]\s*(?:class\s+(\w+)|([A-Z][A-Z0-9_]{2,})\s*[:=])/);
    if (m && !line.startsWith('+++') && !line.startsWith('---')) names.add(m[1] ?? m[2]);
  }
  return [...names];
}

function classify(files) {
  const c = new Set();
  for (const f of files) {
    const test = /__tests__\/|\.test\.|\/visual\//.test(f);
    if (f.startsWith(`${W}/src/`) && !test) c.add('ui');
    if (/^src\/gaia\/apps\/webui\/(main|preload|main-safety-net)\.cjs$|^src\/gaia\/apps\/webui\/services\//.test(f)) c.add('shell');
    if (f.startsWith('src/gaia/ui/routers/') || f === 'src/gaia/ui/models.py' || f === SOURCES.schemas) c.add('api');
    if (f === 'docs/guides/agent-ui.mdx') c.add('guide');
  }
  return [...c];
}

// Matrix mapping: which parity rows show each changed source.
const MATRIX = join(NOTES, 'parity-matrix.md');
const MATRIX_SET = join(REPO, '.local/dev/parity-matrix-set.mjs');
const SRC = `${W}/src`;
const LOOKUP_CAP = 300;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const addChanges = (list, kind, d, changedWord = 'changed') => {
  for (const name of d.added) list.push({ kind, name, change: 'added' });
  for (const name of d.removed) list.push({ kind, name, change: 'removed' });
  for (const name of d.changed) list.push({ kind, name, change: changedWord });
};

// Feature rows only: 11 cells, and not the SEC- table.
function matrixRows() {
  const rows = [];
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/);
    if (!m || m[1].startsWith('SEC-')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.length !== 11) continue;
    rows.push({ id: cells[0], status: cells[2], labels: cells[6], component: cells[9] });
  }
  return rows;
}

// Files under the app's src at rev that mention the change (skipping tests, locales and generated types).
function filesMentioning(rev, kind, name) {
  const flags = kind === 'i18n' || kind === 'token' ? ['-F'] : ['-F', '-w'];
  const pattern = kind === 'i18n' ? `'${name}'` : name;
  let stdout;
  try {
    stdout = git('grep', '-l', ...flags, '-e', pattern, rev, '--', SRC);
  } catch (e) {
    if (e.status === 1) return [];
    throw e;
  }
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(l.indexOf(':') + 1))
    .filter(
      (p) =>
        !/__tests__\/|\.test\.|\/i18n\/locales\//.test(p) &&
        !p.endsWith('/types/api.gen.ts') &&
        !p.endsWith('/types/api.schemas.json'),
    );
}

function rowsForChange(rows, rev, kind, name) {
  const bases = [...new Set(filesMentioning(rev, kind, name).map((p) => p.split('/').pop().split('.')[0]))];
  const res = bases.map((b) => new RegExp(`\\b${escapeRe(b)}\\b`));
  const keys = kind === 'i18n' ? [...new Set([name, name.replace(/\.(?:one|other)$/, '')])] : [];
  return rows.filter(
    (r) => keys.some((k) => r.labels.includes(`\`${k}\``)) || res.some((re) => re.test(r.component)),
  );
}

function reason(c) {
  if (c.kind === 'i18n') return `i18n \`${c.name}\` ${c.change}`;
  if (c.kind === 'schema') return c.change.startsWith('`') ? `schema ${c.change}` : `schema: ${c.change}`;
  return `${c.kind} \`${c.name}\` ${c.change}`;
}

function mapChanges(changes, rev) {
  const rows = matrixRows();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map();
  for (const c of changes) {
    const key = `${c.kind}\u0000${c.name}`;
    if (!groups.has(key)) groups.set(key, { kind: c.kind, name: c.name, changes: [] });
    groups.get(key).changes.push(c);
  }
  const affected = new Map(); // row id -> Set of reasons
  const unmapped = [];
  let capped = 0;
  let lookups = 0;
  for (const g of groups.values()) {
    if (g.kind === 'python') {
      for (const c of g.changes) unmapped.push(reason(c));
      continue;
    }
    if (lookups >= LOOKUP_CAP) {
      capped += g.changes.length;
      continue;
    }
    lookups++;
    const hits = rowsForChange(rows, rev, g.kind, g.name);
    for (const c of g.changes) {
      if (!hits.length) {
        unmapped.push(reason(c));
        continue;
      }
      for (const r of hits) {
        if (!affected.has(r.id)) affected.set(r.id, new Set());
        affected.get(r.id).add(reason(c));
      }
    }
  }
  return { affected, byId, unmapped, capped };
}

function renderRows(affected, byId, doneOnly) {
  const ids = [...affected.keys()].filter((id) => !doneOnly || byId.get(id).status === 'done').sort();
  if (!ids.length) return ['None.'];
  return ids.map((id) => `- ${id} (${byId.get(id).status}): ${[...affected.get(id)].join('; ')}`);
}

const fmtKeys = (keys, max = 30) =>
  keys.length ? keys.slice(0, max).map((k) => `\`${k}\``).join(', ') + (keys.length > max ? `, and ${keys.length - max} more` : '') : 'none';

function main() {
  const opt = args();
  if (opt.fetch) git('fetch', 'upstream', '--no-tags', '--quiet');
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
  const from = opt.from ?? state?.lastChecked;
  if (!from) throw new Error(`No --from and no lastChecked in ${STATE}. Pass --from <rev> for the first run.`);
  const toRev = opt.to ?? 'upstream/main';
  const to = git('rev-parse', '--short', toRev).trim();
  const fromShort = git('rev-parse', '--short', from).trim();

  const raw = git('log', '--reverse', '--format=@@%h\t%ad\t%s', '--date=short', '--name-only', `${from}..${to}`);
  const commits = [];
  for (const block of raw.split('@@').slice(1)) {
    const [head, ...files] = block.trim().split('\n');
    const [sha, date, subject] = head.split('\t');
    commits.push({ sha, date, subject, files: files.filter(Boolean), classes: classify(files.filter(Boolean)) });
  }
  const parity = commits.filter((c) => c.classes.length);
  const quiet = commits.filter((c) => !c.classes.length);

  const out = [];
  const now = new Date().toISOString().slice(0, 10);
  out.push(`## ${now}: ${fromShort}..${to} (${commits.length} commits, ${parity.length} to read)`, '');
  out.push('### Commits that may affect parity', '');
  if (!parity.length) out.push('None.', '');
  for (const c of parity) {
    const shown = c.files.filter((f) => f.startsWith(`${W}/`) || f.startsWith('src/gaia/ui/') || f.startsWith('docs/guides/agent-ui'));
    out.push(`- \`${c.sha}\` ${c.date} ${c.subject} [${c.classes.join(', ')}]`);
    for (const f of shown.slice(0, 8)) out.push(`  - ${f}`);
    if (shown.length > 8) out.push(`  - and ${shown.length - 8} more`);
  }
  out.push('', '### Sources the app must follow', '');
  const changes = [];

  const en = diffMaps(parseI18n(show(from, SOURCES.i18nEn)), parseI18n(show(to, SOURCES.i18nEn)));
  const arTo = parseI18n(show(to, SOURCES.i18nAr));
  const ar = diffMaps(parseI18n(show(from, SOURCES.i18nAr)), arTo);
  const enMissingInAr = en.added.filter((k) => !arTo.has(k));
  addChanges(changes, 'i18n', en, 'text changed');
  out.push(`- i18n en: added ${fmtKeys(en.added)}; removed ${fmtKeys(en.removed)}; text changed ${fmtKeys(en.changed)}`);
  out.push(`- i18n ar: added ${fmtKeys(ar.added)}; removed ${fmtKeys(ar.removed)}; text changed ${fmtKeys(ar.changed)}`);
  if (enMissingInAr.length) out.push(`- i18n: new English keys with no Arabic yet: ${fmtKeys(enMissingInAr)}`);
  const schema = diffSchemas(show(from, SOURCES.schemas), show(to, SOURCES.schemas));
  for (const line of schema) changes.push({ kind: 'schema', name: line.match(/`([^`]+)`/)[1], change: line });
  out.push(`- API schemas:${schema.length ? '' : ' no change'}`);
  for (const l of schema.slice(0, 40)) out.push(`  - ${l}`);
  if (schema.length > 40) out.push(`  - and ${schema.length - 40} more`);
  for (const path of [SOURCES.constants, SOURCES.apiBase]) {
    const d = diffMaps(parseConstants(show(from, path)), parseConstants(show(to, path)));
    addChanges(changes, 'constant', d);
    out.push(`- ${path.split('/').pop()}: added ${fmtKeys(d.added)}; removed ${fmtKeys(d.removed)}; changed ${fmtKeys(d.changed)}`);
  }
  for (const path of SOURCES.css) {
    const d = diffMaps(parseCssVars(show(from, path)), parseCssVars(show(to, path)));
    addChanges(changes, 'token', d);
    if (d.added.length || d.removed.length || d.changed.length) {
      out.push(`- ${path.split('/').pop()} tokens: added ${fmtKeys(d.added)}; removed ${fmtKeys(d.removed)}; changed ${fmtKeys(d.changed)}`);
    }
  }
  for (const path of SOURCES.python) {
    const names = pythonNames(from, to, path);
    for (const n of names) changes.push({ kind: 'python', name: n, change: 'changed' });
    if (names.length) out.push(`- ${path}: changed ${fmtKeys(names)}`);
  }
  const modelsTouched = commits.some((c) => c.files.includes('src/gaia/ui/models.py'));
  const schemasTouched = commits.some((c) => c.files.includes(SOURCES.schemas));
  if (modelsTouched && !schemasTouched) {
    out.push('- Warning: `src/gaia/ui/models.py` changed but `api.schemas.json` did not; the export may be stale upstream.');
  }

  const mapped = mapChanges(changes, to);
  const noRow = mapped.unmapped.map((r) => `- ${r}`);
  if (mapped.capped) noRow.push(`- ${mapped.capped} more changes not mapped (range too large)`);
  if (changes.some((c) => c.kind === 'token')) noRow.push("- Design: regenerate the app's tokens");
  out.push('', '### App rows to update', '', ...renderRows(mapped.affected, mapped.byId, false));
  out.push('', '### Accepted rows to re-check', '', ...renderRows(mapped.affected, mapped.byId, true));
  out.push('', '### Changes with no matrix row', '', ...(noRow.length ? noRow : ['None.']));

  out.push('', `### No parity impact (${quiet.length})`, '');
  out.push(quiet.length ? 'Backend, tests, CI or docs only; the phone app gets these through the shared API.' : 'None.');
  for (const c of quiet) out.push(`- \`${c.sha}\` ${c.subject}`);
  out.push('');

  const report = out.join('\n');
  process.stdout.write(report + '\n');
  if (opt.record) {
    if (!existsSync(LOG)) {
      writeFileSync(LOG, '# Upstream watch (amd/gaia main), newest last\n\nWritten by `.local/dev/parity-upstream-watch.mjs --record`. Reading only; never contact upstream.\n\n');
    }
    appendFileSync(LOG, report + '\n');
    writeFileSync(STATE, JSON.stringify({ schema: 1, lastChecked: git('rev-parse', to).trim(), checkedAt: new Date().toISOString() }, null, 2) + '\n');
    const ids = [...mapped.affected.keys()].sort();
    if (ids.length) {
      execFileSync('node', [MATRIX_SET, 'note', ...ids, '--note', `upstream ${to} (${now}): its sources changed; see upstream-watch.md`], {
        cwd: REPO, env: ENV, stdio: 'inherit',
      });
    }
  }
}

main();
