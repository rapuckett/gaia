// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Permission-prompt wording and consent rules, with no store, so the phone app can import them. */

import type { GaiaNotification } from '../types/agent';
import { isMessageKey, ref, type MessageKey, type Say } from '../i18n/registry';
import { tEn, type Translate } from '../i18n/translator';
import { unseen, unseenCommand, unseenStrict, visibleCommand, visibleStrict, visibleText } from './calendarApproval.core';

/** These decisions apply to one displayed snapshot or code scope, never a tool name. */
/** The prompt raised when a tool reaches outside the chat's files (security.py). */
export const PATH_ACCESS_TOOL = 'allow_path_access';

/** The prompt asking whether to read a folder's CLAUDE.md, AGENTS.md and skills. Answered per folder, never "always". */
export const PROJECT_TRUST_TOOL = 'trust_project_folder';

function pathAccessArgs(args: unknown): { target: string | null; kind: unknown } {
  const { path, kind } = (args ?? {}) as { path?: unknown; kind?: unknown };
  return { target: typeof path === 'string' && path.trim() ? path : null, kind };
}

/**
 * The question a path-access prompt asks. `kind` is the agent's: it omits it only
 * when nothing exists at the path yet, so a prompt that names no path at all
 * says nothing about whether it exists. `followUp` means it backs a call just allowed.
 */
export function pathAccessQuestion(
  args: unknown,
  followUp = false,
  t: Translate = tEn,
  mark: (path: string) => string = (p) => p,
): string {
  const { target, kind } = pathAccessArgs(args);
  const what = !target
    ? ref('prompt.path.what.unknown')
    : ref(kind === 'folder' ? 'prompt.path.what.folder' : kind === 'file' ? 'prompt.path.what.file' : 'prompt.path.what.new', {
      path: mark(target),
    });
  return t(followUp ? 'prompt.path.askAlso' : 'prompt.path.ask', { what });
}

/** The path-access prompt's heading, in the user's terms rather than the tool's name. */
export function pathAccessTitle(args: unknown, followUp = false, t: Translate = tEn): string {
  const { kind } = pathAccessArgs(args);
  const noun = kind === 'folder' ? 'folder' : kind === 'file' ? 'file' : 'location';
  return t(`prompt.path.${followUp ? 'titleAlso' : 'title'}.${noun}`);
}

/**
 * A permission prompt's heading and question, worded from the call in the UI
 * language rather than from its stored English title and message.
 */
/** Calls asked about in the user's words, not as "Allow running python?". */
const PLAIN_TITLES: Record<string, MessageKey> = {
  run_python: 'prompt.title.python',
  execute_python_file: 'prompt.title.pythonFile',
  run_shell_command: 'prompt.title.command',
};

export function permissionPromptText(
  n: GaiaNotification,
  t: Translate = tEn,
  mark: (text: string) => string = (s) => s,
): { heading: string; question: string } {
  const args = n.toolArgs ?? {};
  if (n.tool === PATH_ACCESS_TOOL) {
    return {
      heading: pathAccessTitle(args, n.pathFollowUp, t),
      question: pathAccessQuestion(args, n.pathFollowUp, t, mark),
    };
  }
  if (n.tool === PROJECT_TRUST_TOOL) {
    return { heading: t('prompt.trust.title'), question: t('prompt.trust.ask') };
  }
  // The action fills each half of the sentence in its own language, so Arabic never lands in the English gloss.
  const tool = (say: Say) => toolAction(n, say) ?? mark(n.toolLabel ?? n.tool ?? '');
  const plain = PLAIN_TITLES[n.tool ?? ''];
  return {
    heading: plain
      ? t(plain)
      : t.compose((say) => say(n.toolLabel ? 'prompt.title.tool' : 'prompt.title.toolId', { tool: tool(say) })),
    question: t.compose((say) => say('prompt.needsOk', { tool: tool(say) })),
  };
}

/** The call in the UI language ("writing file"), for a tool whose activity label is translated; the backend's own label is English. */
function toolAction(n: GaiaNotification, say: Say): string | null {
  const key = `tool.${n.tool}.active`;
  if (!n.toolLabel || !isMessageKey(key)) return null;
  const label = say(key as MessageKey);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The scope of a folder grant shared by writes, edits and renames. */
const FILE_CHANGE_SCOPE = 'changes to files in ';

/**
 * What an "always allow" answer covers, in the UI language. The backend words
 * its scope in English (`write_file on notes.txt`, `changes to files in /x`);
 * null when the scope isn't one of those, and the caller keeps the backend's text.
 */
export function alwaysScopeText(n: GaiaNotification, t: Translate): string | null {
  return alwaysScopeWith(n, (key, params) => t.bare(key, params));
}

/** `alwaysScopeText` in the language `say` writes, for a line built inside `t.compose`. */
export function alwaysScopeWith(n: GaiaNotification, say: Say, wrapName: (name: string) => string = (name) => name): string | null {
  if (n.alwaysScope?.startsWith(FILE_CHANGE_SCOPE)) {
    return say('prompt.always.changes', { folder: wrapName(n.alwaysScope.slice(FILE_CHANGE_SCOPE.length)) });
  }
  const action = toolAction(n, say);
  const prefix = `${n.tool} `;
  if (!action || !n.alwaysScope?.startsWith(prefix)) return null;
  const rest = n.alwaysScope.slice(prefix.length);
  if (rest.startsWith('on files in ')) return say('prompt.always.folder', { action, folder: wrapName(rest.slice('on files in '.length)) });
  return say('prompt.always.file', { action, name: wrapName(rest.startsWith('on ') ? rest.slice(3) : rest) });
}

/**
 * The path in the backend's "outside this chat's folders" risk note, else null.
 * The backend sends only that English sentence (`call_risk` has no structured flag), so the
 * phone matches it and words the note from the catalog.
 */
export function outsideFolderPath(note: string): string | null {
  const m = /^([^]+) is outside this chat's folders\. Allowing this also lets GAIA use that file for the rest of the chat\.$/.exec(note);
  return m ? m[1] : null;
}

/** `C:\A\b.txt` and `c:/a/b.txt/` compare equal. Picks card wording only; too loose for an access check. */
function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** The path a gated tool call acts on, if its arguments name one. */
function toolTargetPath(args: Record<string, unknown> | undefined): string | null {
  const value = ['file_path', 'path', 'directory', 'dir_path', 'destination']
    .map((k) => args?.[k])
    .find((v) => typeof v === 'string' && v.trim());
  return typeof value === 'string' ? value : null;
}

/**
 * Whether a path-access request backs the call this chat just allowed — the same
 * path, or a folder holding it. Only then may the prompt read as a follow-up.
 */
export function isPathAccessFollowUp(
  notifications: GaiaNotification[],
  sessionId: string,
  args: unknown,
): boolean {
  const previous = notifications.find((n) => n.type === 'permission_request' && n.sessionId === sessionId);
  if (!previous || previous.response !== 'allow' || previous.tool === PATH_ACCESS_TOOL) return false;
  const acted = toolTargetPath(previous.toolArgs);
  const { path } = (args ?? {}) as { path?: unknown };
  if (!acted || typeof path !== 'string' || !path.trim()) return false;
  const a = normalizePath(acted);
  const p = normalizePath(path);
  if (a === p || a.startsWith(`${p}/`)) return true;
  // A relative argument resolves against a directory the prompt doesn't show.
  const relative = !/^([a-z]:)?\//.test(a) && !a.startsWith('~');
  return relative && p.endsWith(`/${a.replace(/^\.\//, '')}`);
}

export function requiresFreshConsent(tool: string | undefined): boolean {
  return tool === 'share_engineering_context'
    || tool === 'append_engineering_context'
    || tool === 'approve_engineering_code'
    || tool === PATH_ACCESS_TOOL
    || tool === PROJECT_TRUST_TOOL;
}

/**
 * How many earlier prompts in this chat asked the same thing and were allowed:
 * same tool, same "always" scope, same risk. Only counts when "always" is on
 * offer, so the prompt can point at it instead of asking a tenth time.
 */
export function repeatedAllowCount(notifications: GaiaNotification[], prompt: GaiaNotification): number {
  if (!prompt.alwaysScope || !prompt.sessionId || requiresFreshConsent(prompt.tool)) return 0;
  if (prompt.risk === 'destructive') return 0;
  return notifications.filter((n) =>
    n.id !== prompt.id
    && n.type === 'permission_request'
    && n.sessionId === prompt.sessionId
    && n.response === 'allow'
    && n.tool === prompt.tool
    && n.alwaysScope === prompt.alwaysScope
    && n.risk === prompt.risk
  ).length;
}

/** One-line description of a tool call, e.g. `run_shell_command · git status`. */
export function summarize(n: GaiaNotification): string {
  return summarizeField(n).text;
}

/** `summarize` with the argument it came from, so the card can pick that field's marking rule. */
export function summarizeField(n: GaiaNotification): { key: string; text: string } {
  const args = n.toolArgs ?? {};
  // _site: the site a browser-pane read would show the model (SITE_ARG in tool_grants.py).
  const key = ['command', 'file_path', 'path', 'url', '_site', 'query', 'name']
    .find((k) => typeof args[k] === 'string' && (args[k] as string).trim());
  return key ? { key, text: args[key] as string } : { key: '', text: '' };
}

/** A command keeps its layout, a search query reads as prose, and anything else is a name. */
export function shownField(key: string, text: string): { shown: string; coded: boolean } {
  if (COMMAND_ARG.test(key)) return { shown: visibleCommand(text), coded: unseenCommand(text) };
  if (key === 'query') return { shown: visibleText(text, true), coded: unseen(text) };
  return { shown: visibleStrict(text), coded: unseenStrict(text) };
}

/** Keys that hold a command, read with the command rule wherever they show. */
const COMMAND_ARG = /^(command|cmd|argv)$/;

/**
 * Keys read as a name or a command: `summarize`'s list less `query` (prose), plus any key
 * shaped like a path, folder, file, URL, name, id or move end, so a tool's `output_path`
 * or an MCP server's `destination` gets the name rule without being listed by hand.
 */
const NAME_LIKE_ARG = new RegExp(
  '^(command|cmd|argv|_site|to|from|href)$'
  + '|(^|_)(files?|urls?|uris?|ids?|guids?|uuids?|cwds?|src|dest|source|destination|target|location|branch|repo)$'
  + '|(paths?|dirs?|director(y|ies)|folders?|names?)(_hint)?$',
);

/** Whether a key, snake_case or camelCase (`baseURI`, `HTTPUrl`, `path2`), names a thing rather than holding prose. */
function nameLikeArg(key: string): boolean {
  const snake = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/\d+$/, '');
  return NAME_LIKE_ARG.test(snake);
}

/**
 * Argument values as the main field shows them: each name-like string, alone or in a
 * list, marked with that field's rule, so the expanded view reads like the card above it.
 * The rest — code, prose, the approved-exact text — stay as written for the prose pass.
 */
export function shownArgs(args: Record<string, unknown>): Record<string, unknown> {
  const shown = (key: string, value: unknown): unknown => {
    if (typeof value === 'string') return nameLikeArg(key) ? shownField(key, value).shown : value;
    if (Array.isArray(value)) return value.map((item) => shown(key, item));
    if (value && typeof value === 'object') return shownArgs(value as Record<string, unknown>);
    return value;
  };
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, shown(key, value)]));
}

/** Tools that run code GAIA hands over whole (`CODE_SUMMARY_TOOLS` in sse_translation.py). */
export const CODE_TOOLS = new Set(['run_python', 'execute_python_file']);

/** The tool whose prompt carries the file it runs (`SCRIPT_TOOL` in script_preview.py). */
const SCRIPT_TOOL = 'execute_python_file';

/** Why a script is not on its card (`unreadable` in script_preview.py), as message keys. */
export const SCRIPT_UNREADABLE = {
  missing: 'prompt.scriptUnreadable.missing',
  not_text: 'prompt.scriptUnreadable.not_text',
  too_large: 'prompt.scriptUnreadable.too_large',
  unreadable: 'prompt.scriptUnreadable.unreadable',
} as const;

/**
 * The script a file-running call runs, as GAIA read it when it built the prompt
 * (`SCRIPT_ARG` in call_risk.py): its text and the lines past the cap, or why there is none.
 */
export function shownScript(tool: string | undefined, args: Record<string, unknown>): {
  text: string | null;
  hiddenLines: number;
  unreadable: keyof typeof SCRIPT_UNREADABLE | null;
} | null {
  const script = args._script;
  if (tool !== SCRIPT_TOOL || typeof script !== 'object' || script === null) return null;
  const { text, hidden_lines: hidden, unreadable } = script as Record<string, unknown>;
  if (typeof text === 'string') {
    return { text, hiddenLines: typeof hidden === 'number' && hidden > 0 ? hidden : 0, unreadable: null };
  }
  const reason = typeof unreadable === 'string' && unreadable in SCRIPT_UNREADABLE
    ? unreadable as keyof typeof SCRIPT_UNREADABLE
    : 'unreadable';
  return { text: null, hiddenLines: 0, unreadable: reason };
}

/** Tools whose relayed summary is a command and its risk note (`COMMAND_SUMMARY_TOOLS` in sse_translation.py). */
export const COMMAND_SUMMARY_TOOLS = new Set(['run_shell_command', 'wait_for_condition']);

/** Tools whose relayed summary is the exact text being approved (`EXACT_TEXT_ARG` in call_risk.py). The flagship runs them from its send-email skill, so they also arrive namespaced. */
const EXACT_MAIL_TOOLS = ['send_now', 'send_draft', 'reply_to_message', 'forward_message', 'discard_draft', 'update_draft'];
export const EXACT_SUMMARY_TOOLS = new Set([...EXACT_MAIL_TOOLS, ...EXACT_MAIL_TOOLS.map((tool) => `send-email/${tool}`)]);

// The header lines `render_preview` in outgoing.py writes, longest label first so the regex picks it.
export const MAIL_FIELDS: ReadonlyArray<[string, MessageKey]> = [
  ['Attachments left out, not sent', 'permission.mail.leftOut'], // english: matched against the backend's header line
  ['Attachments', 'permission.mail.attachments'],
  ['Subject', 'permission.mail.subject'],
  ['Format', 'permission.mail.format'],
  ['From', 'permission.mail.from'],
  ['Bcc', 'permission.mail.bcc'],
  ['Cc', 'permission.mail.cc'],
  ['To', 'permission.mail.to'],
];
const MAIL_FIELD = new RegExp(`^(${MAIL_FIELDS.map(([label]) => label).join('|')}): (.*)$`);
export const MAIL_ADDRESS_FIELDS: ReadonlySet<string> = new Set(['From', 'To', 'Cc', 'Bcc']);

export interface MailHeader {
  /** Text above the header, such as a note about hidden characters. */
  before: string;
  fields: Array<[label: string, value: string]>;
  body: string;
}

/**
 * An email being approved, split into its header lines and its body so the
 * labels can be translated. Every value stays exactly as it will be sent.
 * `null` when the text is not a header GAIA wrote, which then shows whole.
 */
export function splitMailHeader(text: string): MailHeader | null {
  const lines = text.split('\n');
  const opens = (line: string | undefined) => !!line && /^(From|To): /.test(line);
  // Notes come first, each its own paragraph; the header is the first paragraph that opens like one.
  let start = 0;
  while (!opens(lines[start])) {
    const gap = lines.indexOf('', start);
    if (gap < 0) return null;
    start = gap + 1;
  }
  const fields: MailHeader['fields'] = [];
  let at = start;
  for (; at < lines.length && lines[at] !== ''; at++) {
    const match = MAIL_FIELD.exec(lines[at]);
    if (!match) return null;
    fields.push([match[1], match[2]]);
  }
  if (!fields.some(([label]) => label === 'To')) return null;
  return { before: lines.slice(0, Math.max(0, start - 1)).join('\n'), fields, body: lines.slice(at + 1).join('\n') };
}

/**
 * A relayed command prompt with no args:`command[\n…]\nin <folder>[\n(extras)]\n<risk note>`
 * (`render_command_summary` in sse_translation.py). The command keeps its own lines.
 */
export function splitCommandSummary(summary: string): { command: string; folder: string; extras: string; note: string } | null {
  const lines = summary.split('\n');
  if (lines.length < 2) return null;
  // No note when the call carries no risk worth naming: the folder is then last.
  const hasNote = !lines[lines.length - 1].startsWith('in ');
  const note = hasNote ? lines[lines.length - 1].trim() : '';
  const body = hasNote ? lines.slice(0, -1) : lines;
  let at = -1;
  for (let i = body.length - 1; i > 0; i--) {
    if (body[i].startsWith('in ')) { at = i; break; }
  }
  if (at < 0) return { command: body.join('\n'), folder: '', extras: '', note };
  return {
    command: body.slice(0, at).join('\n'),
    folder: body[at].slice(3).trim(),
    extras: body.slice(at + 1).join(' ').trim(),
    note,
  };
}

/** A grant's folder by its name alone, for a button; the full path stays in its tooltip. */
export function shortScope(scope: string): string {
  // A translated scope wraps its path in direction isolates (U+2068 ... U+2069).
  return scope.replace(/(\s\u2068?)((?:[A-Za-z]:)?[\\/][^\u2069]*)(\u2069?)$/, (_, lead: string, path: string, close: string) => {
    const name = path.split(/[\\/]/).filter(Boolean).pop();
    return `${lead}${name ?? path}${close}`;
  });
}

/** Lines of code a prompt shows before "Show all". */
export const PROMPT_CODE_PREVIEW_LINES = 12;

/** `45` -> "45s", `600` -> "10:00". */
export function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

