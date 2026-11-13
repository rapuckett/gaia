// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Permission-prompt wording and consent rules, with no store, so the phone app can import them. */

import type { GaiaNotification } from '../types/agent';
import { isMessageKey, ref, type MessageKey } from '../i18n/registry';
import { tEn, type Translate } from '../i18n/translator';

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
  const tool = toolAction(n, t) ?? mark(n.toolLabel ?? n.tool ?? '');
  const plain = PLAIN_TITLES[n.tool ?? ''];
  return {
    heading: plain ? t(plain) : t(n.toolLabel ? 'prompt.title.tool' : 'prompt.title.toolId', { tool }),
    question: t('prompt.needsOk', { tool }),
  };
}

/** The call in the UI language ("writing file"), for a tool whose activity label is translated; the backend's own label is English. */
function toolAction(n: GaiaNotification, t: Translate): string | null {
  const key = `tool.${n.tool}.active`;
  if (!n.toolLabel || !isMessageKey(key)) return null;
  const label = t.bare(key as MessageKey);
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * What an "always allow" answer covers, in the UI language. The backend words
 * its scope in English (`write_file on notes.txt`, `write_file on files in /x`);
 * null when the scope isn't one of those, and the caller keeps the backend's text.
 */
export function alwaysScopeText(n: GaiaNotification, t: Translate): string | null {
  const action = toolAction(n, t);
  const prefix = `${n.tool} `;
  if (!action || !n.alwaysScope?.startsWith(prefix)) return null;
  const rest = n.alwaysScope.slice(prefix.length);
  if (rest.startsWith('on files in ')) return t.bare('prompt.always.folder', { action, folder: rest.slice('on files in '.length) });
  return t.bare('prompt.always.file', { action, name: rest.startsWith('on ') ? rest.slice(3) : rest });
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
