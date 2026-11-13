#!/usr/bin/env node
// One-time build of .local/notes/parity-matrix.md from the inventory in .local/notes/parity-inventory/.
// After the first build the matrix is edited directly; re-running refuses to overwrite it unless --force.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NOTES = '/Users/rapuckett/Projects/gaia/.local/notes';
const INV = join(NOTES, 'parity-inventory');
const OUT = join(NOTES, 'parity-matrix.md');
const ID_RE = /^[A-Z]+(?:-[A-Z]+)*-\d+[a-z]?$/;

// Parity's status decisions (2026-11-12).
const SHELL_TARGETS = new Set(['SHELL-01', 'SHELL-04', 'SHELL-05', 'SHELL-12', 'SHELL-18', 'SHELL-19', 'SHELL-20', 'SHELL-21', 'SHELL-36', 'SHELL-39']);
const NA = new Set([
  'NTF-14',
  ...range('SET-GEN', 8, 19),
  ...range('SET-NOTIF', 7, 9),
  ...range('FR-ENGINE', 1, 4),
  ...range('MS-UPD', 1, 6),
]);
const DECIDE_FILES = new Set(['CV-26', 'CV-46', 'SP-06', 'SP-24', 'DOC-18']);

function range(prefix, a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(`${prefix}-${String(i).padStart(2, '0')}`);
  return out;
}

function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return parts.map((c) => c.trim());
}

function parse(file) {
  const text = readFileSync(join(INV, file), 'utf8');
  const sections = [];
  // Text before the first `## ` (minus the `# ` title) is the file's preamble.
  let cur = { title: `Preamble (${file})`, file, rows: [], intro: [], preamble: true };
  sections.push(cur);
  let tail = null;
  for (const line of text.split('\n')) {
    if (/^# /.test(line) || /^---\s*$/.test(line)) continue;
    const h = line.match(/^## (.+)$/);
    if (h) {
      const title = h[1].trim();
      if (/^Files with no row|^Open questions/i.test(title)) {
        tail = { title, file, lines: [] };
        sections.push({ tail });
        cur = null;
        continue;
      }
      tail = null;
      cur = { title, file, rows: [], intro: [] };
      sections.push(cur);
      continue;
    }
    if (tail) {
      tail.lines.push(line);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('| ')) {
      const c = cells(line);
      if (ID_RE.test(c[0])) cur.rows.push(c);
      else cur.intro.push(line);
    } else if (line.startsWith('|')) {
      cur.intro.push(line);
    } else if (line.trim()) {
      cur.intro.push(line);
    }
  }
  return sections;
}

function status(id) {
  if (id.startsWith('SHELL-')) return SHELL_TARGETS.has(id) ? 'missing' : 'n/a';
  if (NA.has(id)) return 'n/a';
  if (DECIDE_FILES.has(id)) return 'decide';
  if (id.startsWith('FR-')) return 'decide';
  return 'missing';
}

const esc = (s) => (s ?? '').replace(/\n/g, ' ');

function main() {
  if (existsSync(OUT) && !process.argv.includes('--force')) {
    throw new Error(`${OUT} exists; it is edited by hand after the first build. Pass --force to rebuild (loses edits).`);
  }
  const files = ['chat.md', 'settings.md', 'library.md'];
  const all = files.flatMap(parse);
  const areas = all.filter((s) => s.rows && s.rows.length && !/^SEC/.test(s.title));
  const notes = all.filter((s) => s.rows && !s.rows.length && s.intro.length);
  const sec = all.find((s) => s.rows && /^SEC/.test(s.title));
  const tails = all.filter((s) => s.tail).map((s) => s.tail);

  const counts = { missing: 0, decide: 0, 'n/a': 0 };
  const summary = [];
  for (const a of areas) {
    const c = { missing: 0, decide: 0, 'n/a': 0 };
    for (const r of a.rows) c[status(r[0])]++;
    for (const k of Object.keys(c)) counts[k] += c[k];
    summary.push(`| ${a.title.replace(/^\d+\.\s*/, '')} | ${a.rows.length} | 0 | 0 | ${c.missing} | ${c.decide} | ${c['n/a']} |`);
  }
  const total = areas.reduce((n, a) => n + a.rows.length, 0);
  const targets = total - counts['n/a'];

  const o = [];
  o.push('# GAIA mobile parity matrix', '');
  o.push('The source of truth for whether the phone app is at parity with GAIA\'s Agent UI. Owned by Parity; never committed. **Version 1, 2026-11-12.**', '');
  o.push(`**Parity: 0 of ${targets} target rows done (0%).** The React Native app hasn't started. ${counts.decide} rows wait on a decision from Rich; ${counts['n/a']} desktop-shell rows have no phone counterpart and aren't counted.`, '');
  o.push('- **Reference:** main\'s Agent UI at `7a6e05c2f` (0.26.0). The upstream watch has read to `240b309b7`; nothing since then touches parity. Labels are quoted from main\'s `en.ts`, or from source where upstream hard-codes them.');
  o.push('- **Rich\'s installed gaia-desktop 0.25.0** is supporting evidence only. It has no i18n catalog and no Arabic, and older screens and labels. A row marked `0.26` in Since is newer than 0.25.0, so no installed-app screenshot can show it.');
  o.push('- **Target:** the React Native (Expo) app (Rich, 2026-11-12). The web UI stays the mobile-web path.');
  o.push('- **Built from** the inventory in `parity-inventory/` (frozen at `7a6e05c2f`). Edit this file from now on; the upstream watch (`.local/dev/parity-upstream-watch.mjs`) says which rows to update.', '');

  o.push('## Status', '');
  o.push('| Status | Meaning |', '| --- | --- |');
  o.push('| `missing` | Not in the app. |');
  o.push('| `decide` | Rich decides whether the app offers it, or how (see Decisions). Counted as a target until he does. |');
  o.push('| `in progress` | A branch is building it; Notes names the branch. |');
  o.push('| `done` | Parity compared the app with the reference, screen by screen: the same labels (catalog keys, English and Arabic), order, every state in States, and the same API calls. Evidence names the shots. |');
  o.push('| `different` | Left out or changed on purpose, with the reason and who decided. A changed row stays a target for its agreed behavior; a left-out row drops out of the count. |');
  o.push('| `n/a` | A desktop-shell feature with no phone counterpart (Parity\'s call). |', '');
  o.push('**Evidence:** `main` is a fixture shot of main\'s UI (Design\'s `test:visual` scenes) and is preferred. `0.25` is a shot of the installed 0.25.0, whose labels and screens may differ. `code` means read from main\'s code with no shot yet. **PC-only:** the backend refuses the call over mobile access; the phone shows the same refusal (R1–R4, below) or the state read-only.', '');

  o.push('## Summary', '');
  o.push('| Area | Rows | done | in progress | missing | decide | n/a |', '| --- | --- | --- | --- | --- | --- | --- |');
  o.push(...summary);
  o.push(`| **All** | **${total}** | **0** | **0** | **${counts.missing}** | **${counts.decide}** | **${counts['n/a']}** |`, '');

  o.push('## Reference notes', '');
  o.push('Cross-cutting facts from the inventory: how Since and PC-only were judged, the refusal texts R1–R4, and what every phone request needs.', '');
  for (const n of notes) {
    o.push(`### ${n.preamble ? `From ${n.file}` : `${n.title} (${n.file})`}`, '');
    for (const l of n.intro) o.push(/^\|/.test(l) ? l : l + (l.startsWith('- ') ? '' : '\n'));
    o.push('');
  }

  o.push('## Decisions waiting on Rich', '');
  o.push('1. **First-run setup on the phone** (`FR-*`, except the desktop engine installer). The backend lets setup run over mobile access, apart from GPU memory and the NPU fix, but the work runs on the PC: installs, multi-gigabyte downloads and model tests. Parity recommends the phone shows setup\'s state and says "finish setup on your PC" rather than rebuilding all of setup.');
  o.push('2. **File actions that open things on the PC** (CV-26, CV-46, SP-06, SP-24, DOC-18): Open, Show in folder and file-path links launch Finder or Explorer on the PC, which does nothing for someone holding a phone. Parity recommends previewing or sharing the file on the phone instead, or copying the path where the file can\'t be served.', '');

  for (const a of areas) {
    o.push(`## ${a.title.replace(/^\d+\.\s*/, '')}`, '');
    // The inventory's own table header and separator are replaced by the matrix's.
    const intro = a.intro.filter((l) => !/^\|\s*ID\s*\|/.test(l) && !/^\|[-| :]+\|?\s*$/.test(l));
    for (const l of intro) o.push(l);
    if (intro.length) o.push('');
    o.push('| ID | Feature | Status | Since | PC-only | Evidence | Exact label(s) | States | API | Component | Notes |');
    o.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of a.rows) {
      const [id, feature, component, labels, api, states, since, pc, notes] = r;
      o.push(`| ${id} | ${esc(feature)} | ${status(id)} | ${esc(since)} | ${esc(pc)} | code | ${esc(labels)} | ${esc(states)} | ${esc(api)} | ${esc(component)} | ${esc(notes)} |`);
    }
    o.push('');
  }

  if (sec) {
    o.push('## Appendix A: routes the backend refuses over mobile access', '');
    o.push('Reference, not parity rows: each belongs to a feature row above. Verified against every `require_local_pc` and `via_tunnel` use in main\'s backend (8 guard sites, 15 routes).', '');
    o.push('| ID | Route | UI surface | Refusal message | Since | Notes |', '| --- | --- | --- | --- | --- | --- |');
    for (const r of sec.rows) o.push(`| ${r.map(esc).join(' | ')} |`);
    o.push('');
  }
  o.push('## Appendix B: inventory notes', '');
  for (const t of tails) {
    o.push(`### ${t.title} (${t.file})`, '');
    o.push(...t.lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')));
  }
  o.push('', '## Changelog', '', `- v1 (2026-11-12): built from the inventory at \`7a6e05c2f\`: ${total} rows, ${targets} targets, every target \`missing\` or \`decide\`.`, '');
  writeFileSync(OUT, o.join('\n'));
  console.log(`wrote ${OUT}: ${total} rows, ${targets} targets (${counts.missing} missing, ${counts.decide} decide), ${counts['n/a']} n/a, ${sec?.rows.length ?? 0} PC-only routes`);
}

main();
