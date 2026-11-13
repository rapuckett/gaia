#!/usr/bin/env node
// Find user-visible English literals in the Agent UI that bypass the i18n catalogs, and rank each
// file by how early the phone app needs it (the backlog tiers, through the matrix's Component cells).
//
//   node parity-literal-scan.mjs [--json]
//
// Parses TSX with TypeScript's parser (agent-host's copy, read-only). Reads the main checkout.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('/Users/rapuckett/Projects/agent-host/node_modules/typescript');

const SRC = '/Users/rapuckett/Projects/gaia/src/gaia/apps/webui/src';
const MATRIX = '/Users/rapuckett/Projects/gaia/.local/notes/parity-matrix.md';

// Backlog v1 tiers (parity-backlog.md); anything else is P4.
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}-${String(a + i).padStart(2, '0')}`);
const TIERS = {
  P1: ['NTF-10', 'NTF-11', 'NTF-12', 'CV-40', 'SHELL-39', 'SB-05', 'SB-07', 'SB-13', 'SB-14', 'SB-15', 'SB-20', 'SB-21', 'SB-23',
    ...range('APP', 3, 6), 'NC-01', 'NC-04', 'NC-05', 'NC-09', 'NC-10', 'NC-12', 'NC-13', 'CV-01', 'CV-08', 'CV-09', 'CV-15', 'CV-24',
    'CV-25', 'CV-29', 'CV-33', 'CV-35', 'CV-38', 'CV-39', 'CV-41', 'CV-42', 'CV-56', 'CMP-01', 'CMP-07', 'CMP-08', 'CMP-09', 'CMP-10',
    'CMP-11', 'CMP-13', 'CMP-15', ...range('PRM', 1, 9), 'PRM-12', 'APP-10', 'APP-11'],
  P2: ['SHELL-20', 'SHELL-21', 'SHELL-04', 'NTF-16', 'NTF-17', 'SHELL-12', 'NTF-18', ...range('NTF', 1, 7), 'SB-27', ...range('SCH', 1, 12), 'APP-13'],
  P3: [...range('RC', 1, 22), ...range('CV', 17, 23), 'CV-34', 'CV-36', 'CV-37', 'CMP-16', 'CMP-18', 'CMP-19', 'CMP-20', ...range('CMP', 22, 26),
    ...range('CV', 43, 48), ...range('CMP', 2, 5), 'SHELL-18', 'CV-59'],
};
const tierOf = (id) => (TIERS.P1.includes(id) ? 1 : TIERS.P2.includes(id) ? 2 : TIERS.P3.includes(id) ? 3 : 4);

const UI_ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label', 'aria-description', 'aria-roledescription',
  'aria-valuetext', 'tooltip', 'heading', 'description', 'message', 'confirmLabel', 'cancelLabel', 'emptyText', 'hint',
  'caption', 'subtitle', 'summary', 'helperText', 'buttonLabel', 'actionLabel', 'text']);
const UI_PROPS = new Set(['label', 'title', 'description', 'message', 'text', 'hint', 'placeholder', 'tooltip', 'heading',
  'detail', 'body', 'subtitle', 'caption', 'cta', 'confirmLabel', 'cancelLabel', 'actionLabel', 'emptyText', 'summary']);
const MSG_CALL = /(^|\.)(set\w*(Error|Message|Notice|Status|Text|Label|Hint|Title|Toast|Banner|Warning)|toast|showToast|addToast|notify|showError|showNotice|alert|confirm)$/;
const KEY_LIKE = /^[a-z][\w]*(\.[\w-]+)+$/; // an i18n key such as 'sidebar.label'
// Real words, not an i18n key. Single words count in JSX text and attributes ("Cancel"); message and
// prop strings must also contain a space (checked where they are collected) so identifiers stay out.
// Template placeholders are stripped first: `${label}: ${prompt}` carries no English of its own.
const words = (s) => {
  const own = s.replace(/\$\{[^}]*\}/g, ' ');
  return /[A-Za-z]{2,}/.test(own) && !KEY_LIKE.test(own.trim());
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\.|\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function inTranslateCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText();
      if (/^(t|tp|tr|translate|t\.plural|i18n\.t)$/.test(callee)) return true;
      return false;
    }
    if (ts.isJsxAttribute(p) || ts.isJsxElement(p) || ts.isBlock(p)) return false;
  }
  return false;
}

// Strings that never reach a person: logs, thrown errors, tests, imports, CSS classes and test ids.
function silentContext(node) {
  // A string used as an object key ('Needs you': 'sidebar.group.needsYou') is a lookup, not copy.
  if (node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node) return true;
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p) && /^(console|logger|log)\.|^(describe|it|test|expect)$/.test(p.expression.getText())) return true;
    if (ts.isJsxAttribute(p) && /^(className|data-|key$|id$|role$|type$|href$|src$)/.test(p.name.getText())) return true;
    if (ts.isElementAccessExpression(p)) return true; // lookups, not copy
    // Only the case label itself (`case 'thinking':`); strings in the case's body can be copy.
    if (ts.isCaseClause(p) && p.expression && (p.expression === node || p.expression.pos <= node.pos && node.end <= p.expression.end)) return true;
  }
  return false;
}

// Non-component files, tiered by the feature their strings serve (checked by hand, 2026-11-12).
// toolEvents.ts builds permission-prompt titles ("Allow ${toolLabel}?"), so it is P1 with PRM-01.
const FILE_TIERS = { 'utils/streamSteps.ts': 1, 'utils/chatAlerts.ts': 2, 'utils/toolEvents.ts': 1, 'stores/scheduleStore.ts': 2,
  'hooks/useFolderPicker.tsx': 4, 'components/render/calculator/calculatorDoc.ts': 3 };
// English used only as lookup keys into the catalog, never shown (checked by hand).
const KEY_ONLY_FILES = new Set(['utils/sessionGrouping.ts']);

function scan(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const reported = new Set();
  const add = (kind, s, node) => {
    const v = s.replace(/\s+/g, ' ').trim();
    if (!v || !words(v) || /^(&[a-z]+;\s*)+$/.test(v)) return;
    reported.add(node.getStart());
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    hits.push({ kind, text: v.slice(0, 90), line });
  };
  const sentences = [];
  const strOf = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateExpression(n) ? n.getText().slice(1, -1) : null);
  // The string operands of a fallback or choice: `a || 'Working'`, `a ?? 'x'`, `c ? 'Yes' : 'No'`.
  const operands = (n) => {
    if (!n) return [];
    if (ts.isParenthesizedExpression(n)) return operands(n.expression);
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) {
      return [...operands(n.left), ...operands(n.right)];
    }
    if (ts.isConditionalExpression(n)) return [...operands(n.whenTrue), ...operands(n.whenFalse)];
    return strOf(n) != null ? [n] : [];
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) add('jsx-text', node.getText(), node);
    else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText();
      if (UI_ATTRS.has(name) && node.initializer) {
        const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        const s = init && strOf(init);
        if (s != null) add('attr', s, init);
      }
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const op of operands(node.expression)) if (!inTranslateCall(op)) add('jsx-expr', strOf(op), op);
    } else if (ts.isCallExpression(node) && MSG_CALL.test(node.expression.getText())) {
      for (const arg of node.arguments) {
        const s = strOf(arg);
        if (s != null && /\s/.test(s)) add('message', s, arg);
      }
    } else if (ts.isPropertyAssignment(node) && UI_PROPS.has(node.name.getText().replace(/['"]/g, ''))) {
      const labelLike = /^(label|title|heading|placeholder|tooltip|cta|confirmLabel|cancelLabel|actionLabel|emptyText)$/.test(node.name.getText().replace(/['"]/g, ''));
      for (const op of operands(node.initializer)) {
        const s = strOf(op);
        // Several words, or one capitalized word in a label-like prop (label: 'Thinking'); not identifiers.
        const oneWord = labelLike && /^[A-Z][a-z]{2,}$/.test(s.trim());
        if ((/\s/.test(s.trim()) || oneWord) && !inTranslateCall(op)) add('prop', s, op);
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) sentences.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Lower-confidence catch-all: sentence-like strings not already reported and not in a silent context.
  for (const node of sentences) {
    if (reported.has(node.getStart()) || inTranslateCall(node) || silentContext(node)) continue;
    // Placeholders become spaces, so `${room}px` reads as "px" (not a sentence) and `${prev} Couldn't…` as "Couldn't…".
    const own = strOf(node).replace(/\$\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    // A capitalized or all-caps first word ("GAIA needs your approval"), then more words; not camelCase or code.
    const sentence = /^[A-Z][A-Za-z']*(?: [^\s]+){1,}/.test(own) && !/[{};<>=]|\/\/|^[A-Z][a-z]+[A-Z]/.test(own);
    // A count template in plain words around a value (`${unsent} to send`); no CSS-like tokens.
    const countPhrase = ts.isTemplateExpression(node) && /^[a-z]{2,}(?: [a-z]{2,})+$/.test(own) && !/[-:;/=_.]/.test(own);
    if (sentence || countPhrase) add('sentence?', strOf(node), node);
  }
  return hits;
}

function componentTiers() {
  const best = new Map();
  const uses = new Map();
  for (const line of readFileSync(MATRIX, 'utf8').split('\n')) {
    const m = line.match(/^\| ([A-Z]+(?:-[A-Z]+)*-\d+[a-z]?) \|/);
    if (!m || m[1].startsWith('SEC-')) continue;
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    const component = cells[10] ?? '';
    const tier = tierOf(m[1]);
    for (const name of component.match(/[A-Za-z][\w-]*(?:\.tsx|\.cjs)?/g) ?? []) {
      const base = name.replace(/\.(tsx|cjs)$/, '');
      if (!/^[A-Z]/.test(base)) continue;
      best.set(base, Math.min(best.get(base) ?? 9, tier));
      if (tier === 1) uses.set(base, (uses.get(base) ?? 0) + 1);
    }
  }
  return { best, uses };
}

function main() {
  const { best, uses } = componentTiers();
  const rows = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (KEY_ONLY_FILES.has(rel) || rel.startsWith('i18n/')) continue;
    const hits = scan(file);
    if (!hits.length) continue;
    const base = basename(file).replace(/\.(tsx|ts)$/, '');
    const component = rel.startsWith('components/') || rel === 'App.tsx';
    const tier = FILE_TIERS[rel] ?? best.get(base) ?? 4;
    rows.push({ file: rel, base, component, tier, p1Rows: uses.get(base) ?? 0, hits });
  }
  rows.sort((a, b) => a.tier - b.tier || b.p1Rows - a.p1Rows || b.hits.length - a.hits.length);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(rows, null, 2));
    return;
  }
  for (const r of rows) {
    const kinds = {};
    for (const h of r.hits) kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
    console.log(`P${r.tier}\t${r.p1Rows}\t${r.hits.length}\t${r.component ? 'component' : 'other'}\t${r.file}\t${JSON.stringify(kinds)}\t${r.hits.slice(0, 3).map((h) => `L${h.line} "${h.text}"`).join(' · ')}`);
  }
}

main();
