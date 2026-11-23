// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaNetworkError, GaiaPinMismatchError, GaiaTransportMissingError, GaiaUnreachableError } from '@/api/errors';
import type { ConfirmToolRequest } from '@/api/client.types';
import type { MessageKey } from '@webui/i18n/registry';

import type { NativeApprovalRecord } from '../../../modules/gaia-push';
import openOnly from '../../../modules/gaia-push/openOnlyTools.json';

/** The buttons on an approval's notification: iOS's category actions (PushActions.swift) and Android's answers (PushActions.kt). */
export const REVIEW_ACTION = 'gaia.review';
export const DENY_ACTION = 'gaia.deny';
/** The notification data's only approval field (iOS): the token of the record the extension stored. */
export const TOKEN_KEY = 'action_token';

/**
 * Tools whose approval notifications offer only Open, never Review or Deny. The list lives in openOnlyTools.json, which
 * the native builds read too; it stays empty until the owner decides T-420 (which risky actions need an OK on the PC itself).
 */
export const OPEN_ONLY_TOOLS: ReadonlySet<string> = new Set(openOnly.tools);

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** A pressed button: which, and the token of what it answers. Never shown or logged. */
export interface PressedAction {
    kind: 'review' | 'deny';
    token: string | null;
    /** Android: the phone was locked when it arrived or was taken. */
    locked: boolean;
}

/** Why a notification's button did nothing; each has a notice the person sees. */
export type ActionFailure = 'stale' | 'unreachable' | 'refused' | 'otherPc' | 'failed' | 'locked';

export type ActionOutcome =
    | { result: 'reviewing' | 'denied'; sessionId: string }
    | { result: 'refused'; reason: ActionFailure }
    // Another press of the same button is still being handled; it shows its own result.
    | { result: 'busy' };

export const NOTICE_TEXT: Record<ActionFailure, MessageKey> = {
    stale: 'mobileApp.push.action.stale',
    unreachable: 'mobileApp.push.action.unreachable',
    refused: 'mobileApp.push.action.refused',
    otherPc: 'mobileApp.push.action.otherPc',
    failed: 'mobileApp.push.action.failed',
    locked: 'mobileApp.push.action.locked',
};

/**
 * The button in a notification response, with its token: iOS's from the notification's data, Android's as the module
 * hands it over. Null for a tap or anything else. A pressed button without a token still comes back, so it is refused
 * out loud: an iOS push that never went through the extension, or an intent another app made up.
 */
export function readPressedAction(actionIdentifier: string, data: unknown): PressedAction | null {
    if (actionIdentifier !== REVIEW_ACTION && actionIdentifier !== DENY_ACTION) return null;
    const d = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const token = d[TOKEN_KEY] ?? d.token;
    return { kind: actionIdentifier === REVIEW_ACTION ? 'review' : 'deny', token: typeof token === 'string' ? token : null, locked: d.locked === true };
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
    /** The record a token stands for, left stored (native peekApproval); `locked` while the phone is locked. */
    peek(token: string): Promise<NativeApprovalRecord | { locked: true } | null>;
    /** Uses the button up: deletes the record and removes the notification (native consumeApproval); true only for the call that took it. */
    consume(token: string): Promise<boolean>;
    /** The PC the app is talking to now, or null. */
    currentPcId(): string | null;
    /** Posts confirm-tool through the app's paired, pinned client, as the chat's own Deny does. */
    confirm(request: ConfirmToolRequest & { always: false; source: 'notification' }): Promise<unknown>;
    /** Notes that the person reached this approval's card from a notification, so the card's answer says so. */
    reviewing(sessionId: string, approvalId: string): void;
    /** Shows the person why nothing was sent. */
    notify(reason: ActionFailure, sessionId: string | null): Promise<void>;
    now(): number;
    openOnlyTools?: ReadonlySet<string>;
}

// Tokens whose press is being handled now: two presses of one button never both reach the PC.
const inFlight = new Set<string>();

function kindOf(error: unknown): string {
    return error instanceof GaiaApiError ? `HTTP ${error.status}` : error instanceof Error ? error.name : 'unknown';
}

/**
 * What a notification's button does. Review opens the chat's approval card and sends nothing, so the person allows it
 * there with the full details; Deny sends the denial (denying can't run anything). The button is used up only once its
 * press is accepted (the card opened, the denial sent) or can never succeed (past the PC's wait, answered elsewhere, an
 * incomplete record, an open-only tool). Any other refusal (a locked phone, another PC, an unreachable PC) keeps the
 * notification, so it can be pressed again. Every refusal posts a notice. The PC still checks the device, the
 * approval's expiry and single use.
 */
export async function answerFromNotification(pressed: PressedAction, deps: ActionDeps): Promise<ActionOutcome> {
    const fail = async (reason: ActionFailure, sessionId: string | null = null): Promise<ActionOutcome> => {
        await deps.notify(reason, sessionId);
        return { result: 'refused', reason };
    };
    if (pressed.locked) return fail('locked');
    const { token } = pressed;
    if (!token || !TOKEN.test(token)) return fail('refused');
    if (inFlight.has(token)) return { result: 'busy' };
    inFlight.add(token);
    // A refusal that can never succeed uses the button up too, so it isn't offered again.
    const finalFail = async (reason: ActionFailure, sessionId: string | null = null): Promise<ActionOutcome> => {
        try {
            await deps.consume(token);
        } catch (error) {
            console.warn(`An approval's notification couldn't be removed (${kindOf(error)})`);
        }
        return fail(reason, sessionId);
    };
    try {
        let peeked: NativeApprovalRecord | { locked: true } | null;
        try {
            peeked = await deps.peek(token);
        } catch (error) {
            console.warn(`An approval's notification couldn't be read (${kindOf(error)})`);
            return await fail('failed');
        }
        if (!peeked) return await fail('stale');
        if ('locked' in peeked) return await fail('locked');
        const record = peeked;
        if (!record.pcId || !ID.test(record.sessionId) || !ID.test(record.approvalId)) return await finalFail('refused');
        const { sessionId } = record;
        if (deps.now() > record.expiresAt) return await finalFail('stale', sessionId);
        if (!answerableTool(record.tool, deps.openOnlyTools)) return await finalFail('refused', sessionId);
        if (deps.currentPcId() !== record.pcId) return await fail('otherPc', sessionId);
        if (pressed.kind === 'review') {
            if (!(await deps.consume(token))) return await fail('stale', sessionId);
            deps.reviewing(sessionId, record.approvalId);
            return { result: 'reviewing', sessionId };
        }
        try {
            await deps.confirm({ session_id: sessionId, approved: false, always: false, confirm_id: record.approvalId, source: 'notification' });
        } catch (error) {
            // Only the kind of failure: the request and the PC's reply could name the approval.
            console.warn(`A denial from a notification wasn't sent (${kindOf(error)})`);
            const reason = failureOf(error);
            // Answered or ended on the PC (409, 404) is final; unreachable or another error can be tried again.
            return await (reason === 'stale' ? finalFail(reason, sessionId) : fail(reason, sessionId));
        }
        await deps.consume(token);
        return { result: 'denied', sessionId };
    } finally {
        inFlight.delete(token);
    }
}
