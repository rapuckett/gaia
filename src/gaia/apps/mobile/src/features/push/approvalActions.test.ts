// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';

import type { NativeApprovalRecord } from '../../../modules/gaia-push';
import { isActionNotice, noticeContent, postActionNotice } from './actionNotice';
import { answerFromNotification, DENY_ACTION, OPEN_ONLY_TOOLS, readPressedAction, REVIEW_ACTION, type ActionDeps, type PressedAction } from './approvalActions';
import { forgetReviewedForTests, markReviewedFromNotification, reviewedFromNotification } from './reviewedFromNotification';

jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));

const NOW = 1_795_000_000_000;
const APPROVAL_ID = '0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b';
const TOKEN = 'AAECAwQFBgcICQoLDA0ODw';

const RECORD: NativeApprovalRecord = { pcId: 'pc1', sessionId: 's_42', approvalId: APPROVAL_ID, tool: 'write_file', receivedAt: NOW - 1000, expiresAt: NOW + 599_000 };

function pressed(overrides: Partial<PressedAction> = {}): PressedAction {
    return { kind: 'deny', token: TOKEN, locked: false, ...overrides };
}

/** A native store holding one record under TOKEN, claimable once, as claimApproval is. */
function deps(record: NativeApprovalRecord | null = RECORD, overrides: Partial<Omit<ActionDeps, 'claim' | 'confirm' | 'notify' | 'reviewing'>> = {}) {
    const store = new Map(record ? [[TOKEN, record]] : []);
    const claim = jest.fn(async (token: string) => {
        const found = store.get(token) ?? null;
        store.delete(token);
        return found;
    });
    const confirm = jest.fn<Promise<unknown>, Parameters<ActionDeps['confirm']>>().mockResolvedValue({ status: 'ok', approved: false, granted: null });
    const notify = jest.fn<Promise<void>, Parameters<ActionDeps['notify']>>().mockResolvedValue(undefined);
    const reviewing = jest.fn<void, [string, string]>();
    return { claim, confirm, notify, reviewing, currentPcId: () => 'pc1', now: () => NOW, ...overrides };
}

beforeEach(() => forgetReviewedForTests());

describe('reading a pressed button', () => {
    it("reads Review from the iOS extension's token and Deny from Android's", () => {
        expect(readPressedAction(REVIEW_ACTION, { route: '/chat/s_42', action_token: TOKEN })).toEqual({ kind: 'review', token: TOKEN, locked: false });
        expect(readPressedAction(DENY_ACTION, { action: DENY_ACTION, token: TOKEN, locked: false })).toEqual({ kind: 'deny', token: TOKEN, locked: false });
        expect(readPressedAction(DENY_ACTION, { action: DENY_ACTION, token: null, locked: true })).toEqual({ kind: 'deny', token: null, locked: true });
    });

    it('is null for a plain tap, and keeps a pressed button without a token so it is refused out loud', () => {
        expect(readPressedAction('expo.modules.notifications.actions.DEFAULT', { action_token: TOKEN })).toBeNull();
        expect(readPressedAction('gaia.approve', { action_token: TOKEN })).toBeNull();
        expect(readPressedAction(REVIEW_ACTION, { route: '/chat/s_42' })).toEqual({ kind: 'review', token: null, locked: false });
    });
});

describe("a notification's Review", () => {
    it('opens the approval card and sends nothing', async () => {
        const d = deps();
        await expect(answerFromNotification(pressed({ kind: 'review' }), d)).resolves.toEqual({ result: 'reviewing', sessionId: 's_42' });
        expect(d.confirm).not.toHaveBeenCalled();
        expect(d.notify).not.toHaveBeenCalled();
        expect(d.reviewing).toHaveBeenCalledWith('s_42', APPROVAL_ID);
    });

    it("marks the card's own answer as one from a notification", () => {
        expect(reviewedFromNotification('s_42', APPROVAL_ID)).toBe(false);
        markReviewedFromNotification('s_42', APPROVAL_ID);
        expect(reviewedFromNotification('s_42', APPROVAL_ID)).toBe(true);
        expect(reviewedFromNotification('s_42', 'other')).toBe(false);
        expect(reviewedFromNotification('s_42', undefined)).toBe(false);
    });
});

describe("a notification's Deny", () => {
    it('posts confirm-tool with the approval as confirm_id, never always, from a notification', async () => {
        const d = deps();
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'denied', sessionId: 's_42' });
        expect(d.confirm.mock.calls).toEqual([[{ session_id: 's_42', approved: false, always: false, confirm_id: APPROVAL_ID, source: 'notification' }]]);
        expect(d.notify).not.toHaveBeenCalled();
    });

    it('claims its token once, so a second press sends nothing', async () => {
        const d = deps();
        await answerFromNotification(pressed(), d);
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'refused', reason: 'stale' });
        expect(d.confirm).toHaveBeenCalledTimes(1);
        expect(d.claim).toHaveBeenCalledTimes(2);
    });
});

describe('refusing a button', () => {
    it.each<[string, Partial<PressedAction>, string]>([
        ['without a token (a push that skipped the extension, or a made-up intent)', { token: null }, 'refused'],
        ['with a malformed token', { token: '../s_42' }, 'refused'],
        ['pressed on a locked phone', { locked: true, token: null }, 'locked'],
    ])('%s, with a notice and without claiming anything', async (_, overrides, reason) => {
        const d = deps();
        await expect(answerFromNotification(pressed(overrides), d)).resolves.toEqual({ result: 'refused', reason });
        expect(d.claim).not.toHaveBeenCalled();
        expect(d.confirm).not.toHaveBeenCalled();
        expect(d.notify).toHaveBeenCalledWith(reason, null);
    });

    it('whose token the store has never seen', async () => {
        const d = deps(null);
        await expect(answerFromNotification(pressed({ kind: 'review' }), d)).resolves.toEqual({ result: 'refused', reason: 'stale' });
        expect(d.reviewing).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<NativeApprovalRecord>]>([
        ['no approval id', { approvalId: '' }],
        ['a malformed chat id', { sessionId: '../s_42' }],
        ['no PC', { pcId: '' }],
    ])('whose record has %s', async (_, overrides) => {
        const d = deps({ ...RECORD, ...overrides });
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'refused', reason: 'refused' });
        expect(d.confirm).not.toHaveBeenCalled();
    });

    it("once the PC's wait (ttl_s) is over, by this phone's clock", async () => {
        const d = deps({ ...RECORD, expiresAt: NOW - 1 });
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'refused', reason: 'stale' });
        expect(d.confirm).not.toHaveBeenCalled();
        expect(d.notify).toHaveBeenCalledWith('stale', 's_42');
    });

    it("from a PC the app isn't talking to", async () => {
        const d = deps(RECORD, { currentPcId: () => 'pc2' });
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'refused', reason: 'otherPc' });
        expect(d.confirm).not.toHaveBeenCalled();
    });

    it('for an open-only tool, or, with a list, an approval naming no tool', async () => {
        expect(OPEN_ONLY_TOOLS.size).toBe(0);
        const openOnlyTools = new Set(['write_file']);
        await expect(answerFromNotification(pressed({ kind: 'review' }), deps(RECORD, { openOnlyTools }))).resolves.toEqual({ result: 'refused', reason: 'refused' });
        await expect(answerFromNotification(pressed(), deps({ ...RECORD, tool: null }, { openOnlyTools }))).resolves.toEqual({ result: 'refused', reason: 'refused' });
        await expect(answerFromNotification(pressed(), deps({ ...RECORD, tool: 'read_file' }, { openOnlyTools }))).resolves.toEqual({ result: 'denied', sessionId: 's_42' });
    });

    it.each([
        ['already answered or expired on the PC', new GaiaApiError(409, 'That permission prompt is no longer waiting for an answer.'), 'stale'],
        ['the turn ended', new GaiaApiError(404, 'gone'), 'stale'],
        ['the PC unreachable', new GaiaNetworkError('https://pc.example:4243/api/chat/confirm-tool', new Error('timeout')), 'unreachable'],
        ['a PC error', new GaiaApiError(500, 'boom'), 'failed'],
    ])('a denial when %s, with a notice, logging no ids or token', async (_, error, reason) => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const d = deps();
        d.confirm.mockRejectedValue(error);
        await expect(answerFromNotification(pressed(), d)).resolves.toEqual({ result: 'refused', reason });
        expect(d.notify).toHaveBeenCalledWith(reason, 's_42');
        const logged = JSON.stringify(warn.mock.calls);
        for (const secret of [APPROVAL_ID, 's_42', TOKEN]) expect(logged).not.toContain(secret);
        warn.mockRestore();
    });
});

describe('the notice', () => {
    it('says in plain words why nothing was sent, in English and Arabic, and opens the chat', () => {
        expect(noticeContent('stale', 'en', 's_42')).toEqual({
            title: "Your answer wasn't sent",
            body: 'This request was already answered or is no longer waiting, so nothing changed.',
            data: { gaiaNotice: true, route: '/chat/s_42' },
        });
        expect(noticeContent('locked', 'en', null).body).toBe('Unlock your phone, then press the button again.');
        const ar = noticeContent('unreachable', 'ar', null);
        expect(ar.title).toBe('لم تُرسَل إجابتك');
        expect(ar.body).toMatch(/^تعذّر على GAIA الوصول/);
        expect(ar.data).toEqual({ gaiaNotice: true });
        expect(isActionNotice(ar.data)).toBe(true);
        expect(isActionNotice({ route: '/' })).toBe(false);
    });

    it('is posted now, and a failure to post it is logged', async () => {
        const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
        schedule.mockResolvedValueOnce('id');
        await postActionNotice('failed', 'en', 's_42');
        // Android posts it on the "Needs you" channel the approval came on.
        const trigger = Platform.OS === 'android' ? { channelId: 'gaia.needs_you' } : null;
        expect(schedule).toHaveBeenCalledWith({ content: noticeContent('failed', 'en', 's_42'), trigger });

        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        schedule.mockRejectedValueOnce(new Error('not allowed'));
        await expect(postActionNotice('failed', 'en', null)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.stringContaining("wasn't sent (failed)"), expect.any(Error));
        error.mockRestore();
    });
});
