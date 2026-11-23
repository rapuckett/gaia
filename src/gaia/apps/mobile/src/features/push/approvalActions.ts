// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaNetworkError, GaiaPinMismatchError, GaiaTransportMissingError, GaiaUnreachableError } from '@/api/errors';
import type { MessageKey } from '@webui/i18n/registry';

import openOnly from '../../../modules/gaia-push/openOnlyTools.json';

/** The action identifiers on an approval's notification: iOS's category actions (PushActions.swift) and Android's answers (PushActions.kt). */
export const APPROVE_ACTION = 'gaia.approve';
export const DENY_ACTION = 'gaia.deny';

/**
 * Tools whose approval notifications offer only Open, never Approve. The list lives in openOnlyTools.json, which the
 * native builds read too; it stays empty until the owner decides T-420 (which risky actions need an OK on the PC itself).
 */
export const OPEN_ONLY_TOOLS: ReadonlySet<string> = new Set(openOnly.tools);

/** How long the PC waits for an answer (TOOL_CONFIRM_TIMEOUT_SECONDS in src/gaia/ui/sse_handler.py); older than this, nothing is sent. */
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** An Approve or Deny pressed on a notification. Its ids are never shown or logged. */
export interface ApprovalAction {
    approved: boolean;
    pcId: string;
    sessionId: string;
    approvalId: string;
    tool: string | null;
    /** When this phone received the push, by its own clock (unix ms), so a skewed PC clock can't expire it early. */
    receivedAt: number;
}

/** Why an answer from a notification wasn't sent; each has a notice the person sees. */
export type ActionFailure = 'stale' | 'unreachable' | 'refused' | 'otherPc' | 'failed';

export type ActionOutcome = { sent: true } | { sent: false; reason: ActionFailure };

export const NOTICE_TEXT: Record<ActionFailure, MessageKey> = {
    stale: 'mobileApp.push.action.stale',
    unreachable: 'mobileApp.push.action.unreachable',
    refused: 'mobileApp.push.action.refused',
    otherPc: 'mobileApp.push.action.otherPc',
    failed: 'mobileApp.push.action.failed',
};

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

/**
 * The action in a notification response: Approve or Deny, with the approval the notification's data carries (iOS: the
 * extension's `approval`; Android: the module's extras). Null for a tap or anything else; a pressed action whose data is
 * missing still comes back, with empty ids, so it is refused out loud rather than dropped.
 */
export function readApprovalAction(actionIdentifier: string, approval: unknown): ApprovalAction | null {
    if (actionIdentifier !== APPROVE_ACTION && actionIdentifier !== DENY_ACTION) return null;
    const a = approval && typeof approval === 'object' ? (approval as Record<string, unknown>) : {};
    return {
        approved: actionIdentifier === APPROVE_ACTION,
        pcId: text(a.pc_id ?? a.pcId) ?? '',
        sessionId: text(a.session_id ?? a.sessionId) ?? '',
        approvalId: text(a.approval_id ?? a.approvalId) ?? '',
        tool: text(a.tool),
        receivedAt: typeof (a.received_at ?? a.receivedAt) === 'number' ? Number(a.received_at ?? a.receivedAt) : 0,
    };
}

/** Whether a notification for this tool may answer at all; with a non-empty list, an approval naming no tool may not. */
export function answerableTool(tool: string | null, openOnlyTools: ReadonlySet<string> = OPEN_ONLY_TOOLS): boolean {
    return tool === null ? openOnlyTools.size === 0 : !openOnlyTools.has(tool);
}

/** The failure a confirm-tool error is, in the person's terms. */
export function failureOf(error: unknown): ActionFailure {
    if (error instanceof GaiaApiError && (error.status === 404 || error.status === 409)) return 'stale';
    if (
        error instanceof GaiaNetworkError ||
        error instanceof GaiaUnreachableError ||
        error instanceof GaiaPinMismatchError ||
        error instanceof GaiaTransportMissingError
    ) {
        return 'unreachable';
    }
    return 'failed';
}

export interface ActionDeps {
    /** The PC the app is talking to now, or null. */
    currentPcId(): string | null;
    /** Posts confirm-tool through the app's paired, pinned client, as the chat's own Allow does. */
    confirm(request: { session_id: string; approved: boolean; always: false; confirm_id: string }): Promise<unknown>;
    /** Shows the person why nothing was sent. */
    notify(reason: ActionFailure, sessionId: string | null): Promise<void>;
    now(): number;
    openOnlyTools?: ReadonlySet<string>;
}

// Answers sent (or tried) from a notification while the app runs, by PC, chat and approval: each is posted at most once.
const answered = new Set<string>();

export function forgetAnsweredForTests(): void {
    answered.clear();
}

/**
 * Sends a notification's Approve or Deny, once, through the paired PC. It refuses, with a notice, an action whose
 * approval is incomplete, for an open-only tool, older than the PC's wait, already answered here, or from another PC.
 * The PC still checks the device, the approval's expiry and single use; its refusals become notices too.
 */
export async function answerFromNotification(action: ApprovalAction, deps: ActionDeps): Promise<ActionOutcome> {
    const fail = async (reason: ActionFailure): Promise<ActionOutcome> => {
        await deps.notify(reason, ID.test(action.sessionId) ? action.sessionId : null);
        return { sent: false, reason };
    };
    if (!action.pcId || !ID.test(action.sessionId) || !ID.test(action.approvalId) || action.receivedAt <= 0) return fail('refused');
    if (!answerableTool(action.tool, deps.openOnlyTools)) return fail('refused');
    const key = `${action.pcId}\n${action.sessionId}\n${action.approvalId}`;
    if (answered.has(key)) return fail('stale');
    answered.add(key);
    if (deps.now() - action.receivedAt > APPROVAL_TTL_MS) return fail('stale');
    if (deps.currentPcId() !== action.pcId) {
        // Not answered after all: switching to that PC and pressing again may still work.
        answered.delete(key);
        return fail('otherPc');
    }
    try {
        await deps.confirm({ session_id: action.sessionId, approved: action.approved, always: false, confirm_id: action.approvalId });
        return { sent: true };
    } catch (error) {
        const reason = failureOf(error);
        // Only the kind of failure: the request and the PC's reply could name the approval.
        console.warn(`An answer from a notification wasn't sent (${error instanceof GaiaApiError ? `HTTP ${error.status}` : error instanceof Error ? error.name : 'unknown'})`);
        return fail(reason);
    }
}
