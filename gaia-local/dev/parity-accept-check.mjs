#!/usr/bin/env node
// Parity's mechanical pre-check for an acceptance task: for every matrix row in the task's epic, are the
// catalog keys the row quotes used in the phone app's source, and are the routes it calls in the app's
// client? Passing this is necessary, not sufficient: states, order and look still need the screen-by-
// screen comparison in English and Arabic.
//
//   node parity-accept-check.mjs --task chat-accept [--app <dir>]
//   node parity-accept-check.mjs --rows SB-05 'SB-1*' [--app <dir>]
//
// --app defaults to the main checkout's src/gaia/apps/mobile (the landed app); pass a worktree's
// src/gaia/apps/mobile to check work before it lands.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = '/Users/rapuckett/Projects/gaia';
const SPRINT = `${REPO}/.local/notes/2026-11-12-mobile-parity-sprint.md`;
const MATRIX = `${REPO}/.local/notes/parity-matrix.md`;
const EN = `${REPO}/src/gaia/apps/webui/src/i18n/locales/en.ts`;
const ID = /^[A-Z]+(?:-[A-Z]+)*-\d+[a-z]?$/;

function args() {
  const a = process.argv.slice(2);
  const out = { task: null, rows: [], app: `${REPO}/src/gaia/apps/mobile` };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--task') out.task = a[++i];
    else if (a[i] === '--app') out.app = a[++i];
    else if (a[i] === '--rows') while (a[i + 1] && !a[i + 1].startsWith('--')) out.rows.push(a[++i]);
  }
  if (!out.task && !out.rows.length) throw new Error('pass --task <accept-task-id> or --rows <ID>...');
  return out;
}

const split = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

// "SB-01..SB-04, SB-23" -> SB-01 SB-02 SB-03 SB-04 SB-23
function expand(spec) {
  const out = [];
  for (const part of spec.split(/,\s*/).map((s) => s.trim()).filter(Boolean)) {
    const r = part.match(/^([A-Z]+(?:-[A-Z]+)*)-(\d+)\.\.\1-(\d+)$/);
    if (r) {
      const [, prefix, a, b] = r;
      for (let n = Number(a); n <= Number(b); n++) out.push(`${prefix}-${String(n).padStart(a.length, '0')}`);
    } else if (ID.test(part)) out.push(part);
  }
  return out;
}

function epicRows(taskId) {
  let epic = null;
  const epics = new Map();
  for (const line of readFileSync(SPRINT, 'utf8').split('\n')) {
    const h = line.match(/^### (.+?) \(\d+ tasks/);
    if (h) {
      epic = { name: h[1], tasks: [], rows: [] };
      epics.set(epic.name, epic);
      continue;
    }
    const t = line.match(/^\| `([a-z0-9-]+)` \|/);
    if (t && epic) {
      const c = split(line);
      epic.tasks.push(t[1]);
      epic.rows.push(...expand(c[10] ?? ''));
    }
  }
  for (const e of epics.values()) if (e.tasks.includes(taskId)) return { name: e.name, rows: [...new Set(e.rows)] };
  throw new Error(`no epic in the sprint holds task ${taskId}`);
}

function matrixRows() {
  const rows = new Map();
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/);
    if (m && !m[1].startsWith('SEC-')) rows.set(m[1], split(line));
  }
  return rows;
}

function appText(dir) {
  if (!existsSync(dir)) throw new Error(`no app source at ${dir}; pass --app <worktree>/src/gaia/apps/mobile`);
  const parts = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (['node_modules', '.expo', 'ios', 'android', 'dist', 'web-build', '__tests__'].includes(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.(test|spec)\./.test(name)) parts.push(readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return parts.join('\n');
}

function main() {
  const opt = args();
  const all = matrixRows();
  let title;
  let ids;
  if (opt.task) {
    const e = epicRows(opt.task);
    title = `${opt.task}: ${e.name}`;
    ids = e.rows;
  } else {
    title = opt.rows.join(' ');
    ids = [...all.keys()].filter((id) => opt.rows.some((s) => (s.endsWith('*') ? id.startsWith(s.slice(0, -1)) : id === s)));
  }
  const enSrc = readFileSync(EN, 'utf8');
  const enKeys = new Set([...enSrc.matchAll(/^ {4}'([^']+)':/gm)].map((m) => m[1]));
  // English text -> the keys that carry it, for rows that quote a label without its key (single-line values).
  const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\\(['"`])/g, '$1').trim();
  const byText = new Map();
  for (const m of enSrc.matchAll(/^ {4}'([^']+)': (['"`])(.*)\2,\s*$/gm)) {
    const t = norm(m[3]);
    byText.set(t, [...(byText.get(t) ?? []), m[1]]);
  }
  const app = appText(opt.app);
  const uses = (k) => new RegExp(`['"\`]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.(one|other))?['"\`]`).test(app);
  const out = [`# Acceptance pre-check: ${title}`, '', `App source: \`${opt.app}\`. ${ids.length} rows.`, ''];
  out.push('| ID | Status | Keys in app | Missing keys | Labels in app (by text) | Missing labels | Routes in app | Missing routes |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  let ready = 0;
  let visualOnly = 0;
  for (const id of ids) {
    const c = all.get(id);
    if (!c) {
      out.push(`| ${id} | not in matrix | | | | | | |`);
      continue;
    }
    const keys = [...new Set([...c[6].matchAll(/`([a-z][\w]*(?:\.[\w-]+)+)`/g)].map((k) => k[1]))].filter((k) => enKeys.has(k) || enKeys.has(`${k}.one`));
    const missingKeys = keys.filter((k) => !uses(k));
    // Quoted labels whose text is a catalog value; the row passes a label when the app uses any key carrying it.
    const labels = [...new Set([...c[6].matchAll(/"([^"]{3,})"/g)].map((q) => norm(q[1])))].filter((t) => byText.has(t) && !byText.get(t).some((k) => keys.includes(k)));
    const missingLabels = labels.filter((t) => !byText.get(t).some(uses));
    const routes = [...new Set([...c[8].matchAll(/\b(GET|POST|PUT|PATCH|DELETE) +`?(\/(?:api|v1)\/[^\s,;)`]+)/g)].map((r) => `${r[1]} ${r[2]}`))];
    const missingRoutes = routes.filter((r) => {
      const path = r.split(' ')[1].replace(/^\/api/, '').replace(/[?#].*$/, '');
      const re = path.split(/\{[^}]+\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(`[^/'"\`]+`);
      return !new RegExp(re).test(app);
    });
    const checks = keys.length + labels.length + routes.length;
    if (!checks) visualOnly++;
    else if (!missingKeys.length && !missingLabels.length && !missingRoutes.length) ready++;
    out.push(
      `| ${id} | ${c[2]} | ${keys.length - missingKeys.length}/${keys.length} | ${missingKeys.map((k) => `\`${k}\``).join(', ')} | ${labels.length - missingLabels.length}/${labels.length} | ${missingLabels.map((t) => `"${t.slice(0, 40)}"`).join(', ')} | ${routes.length - missingRoutes.length}/${routes.length} | ${missingRoutes.map((r) => `\`${r}\``).join(', ')} |`,
    );
  }
  const checked = ids.length - visualOnly;
  out.splice(
    3,
    0,
    `**${ready} of ${checked}** checkable rows use every quoted key, label and route; ${visualOnly} rows quote nothing checkable (visual only). Then compare screens in English and Arabic.`,
    '',
  );
  console.log(out.join('\n'));
}

main();
