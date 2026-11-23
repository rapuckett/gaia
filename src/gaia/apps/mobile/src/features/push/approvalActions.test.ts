// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';

import { isActionNotice, noticeContent, postActionNotice } from './actionNotice';
import {
    answerFromNotification,
    APPROVAL_TTL_MS,
    APPROVE_ACTION,
    DENY_ACTION,
    forgetAnsweredForTests,
    OPEN_ONLY_TOOLS,
    readApprovalAction,
    type ActionDeps,
    type ApprovalAction,
} from './approvalActions';

jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));

const NOW = 1_795_000_000_000;
const APPROVAL_ID = '0b6f2c1e-8d4a-4f7e-9a3b-2c5d6e7f8a9b';

function action(overrides: Partial<ApprovalAction> = {}): ApprovalAction {
    return { approved: true, pcId: 'pc1', sessionId: 's_42', approvalId: APPROVAL_ID, tool: 'write_file', receivedAt: NOW - 1000, ...overrides };
}

function deps(overrides: Partial<Omit<ActionDeps, 'confirm' | 'notify'>> = {}) {
    const confirm = jest.fn<Promise<unknown>, Parameters<ActionDeps['confirm']>>().mockResolvedValue({ status: 'ok', approved: true, granted: null });
    const notify = jest.fn<Promise<void>, Parameters<ActionDeps['notify']>>().mockResolvedValue(undefined);
    return { confirm, notify, currentPcId: () => 'pc1', now: () => NOW, ...overrides };
}

beforeEach(() => forgetAnsweredForTests());

describe('reading a notification response', () => {
    it("reads Approve from the iOS extension's data and Deny from Android's extras", () => {
        expect(readApprovalAction(APPROVE_ACTION, { pc_id: 'pc1', session_id: 's_42', approval_id: APPROVAL_ID, received_at: NOW, tool: 'write_file' })).toEqual(
            action({ receivedAt: NOW }),
        );
        expect(readApprovalAction(DENY_ACTION, { pcId: 'pc1', sessionId: 's_42', approvalId: APPROVAL_ID, receivedAt: NOW, tool: null })).toEqual(
            action({ approved: false, tool: null, receivedAt: NOW }),
        );
    });

    it('is null for a plain tap, and keeps a pressed action with missing data so it is refused out loud', () => {
        expect(readApprovalAction('expo.modules.notifications.actions.DEFAULT', { session_id: 's_42' })).toBeNull();
        expect(readApprovalAction(APPROVE_ACTION, undefined)).toEqual({ approved: true, pcId: '', sessionId: '', approvalId: '', tool: null, receivedAt: 0 });
    });
});

describe('answering from a notification', () => {
    it('posts confirm-tool with the approval as confirm_id and never always', async () => {
        const d = deps();
        await expect(answerFromNotification(action(), d)).resolves.toEqual({ sent: true });
        await answerFromNotification(action({ approved: false, approvalId: 'other' }), d);
        expect(d.confirm.mock.calls).toEqual([
            [{ session_id: 's_42', approved: true, always: false, confirm_id: APPROVAL_ID }],
            [{ session_id: 's_42', approved: false, always: false, confirm_id: 'other' }],
        ]);
        expect(d.notify).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<ApprovalAction>]>([
        ['no approval id', { approvalId: '' }],
        ['no chat id', { sessionId: '' }],
        ['a malformed chat id', { sessionId: '../s_42' }],
        ['no PC', { pcId: '' }],
        ['no arrival time', { receivedAt: 0 }],
    ])('refuses, with a notice, an action with %s', async (_, overrides) => {
        const d = deps();
        await expect(answerFromNotification(action(overrides), d)).resolves.toEqual({ sent: false, reason: 'refused' });
        expect(d.confirm).not.toHaveBeenCalled();
        expect(d.notify).toHaveBeenCalledWith('refused', overrides.sessionId === undefined ? 's_42' : null);
    });

    it('never approves an open-only tool, nor, with a list, an approval naming no tool', async () => {
        expect(OPEN_ONLY_TOOLS.size).toBe(0);
        const d = deps({ openOnlyTools: new Set(['write_file']) });
        await expect(answerFromNotification(action(), d)).resolves.toEqual({ sent: false, reason: 'refused' });
        await expect(answerFromNotification(action({ tool: null }), d)).resolves.toEqual({ sent: false, reason: 'refused' });
        await expect(answerFromNotification(action({ tool: 'read_file' }), d)).resolves.toEqual({ sent: true });
        expect(d.confirm).toHaveBeenCalledTimes(1);
    });

    it('posts an approval once, however often its action arrives', async () => {
        const d = deps();
        await answerFromNotification(action(), d);
        await expect(answerFromNotification(action({ approved: false }), d)).resolves.toEqual({ sent: false, reason: 'stale' });
        expect(d.confirm).toHaveBeenCalledTimes(1);
        expect(d.notify).toHaveBeenCalledWith('stale', 's_42');
    });

    it("sends nothing once the PC's wait is over, by this phone's own clock", async () => {
        const d = deps();
        await expect(answerFromNotification(action({ receivedAt: NOW - APPROVAL_TTL_MS - 1 }), d)).resolves.toEqual({ sent: false, reason: 'stale' });
        expect(d.confirm).not.toHaveBeenCalled();
        await answerFromNotification(action({ receivedAt: NOW - APPROVAL_TTL_MS - 1 }), d);
        expect(d.confirm).not.toHaveBeenCalled();
    });

    it("sends nothing to a PC the app isn't talking to, and lets it be answered after switching", async () => {
        let current = 'pc2';
        const d = deps({ currentPcId: () => current });
        await expect(answerFromNotification(action(), d)).resolves.toEqual({ sent: false, reason: 'otherPc' });
        expect(d.confirm).not.toHaveBeenCalled();
        current = 'pc1';
        await expect(answerFromNotification(action(), d)).resolves.toEqual({ sent: true });
    });

    it.each([
        ['already answered or expired on the PC', new GaiaApiError(409, 'That permission prompt is no longer waiting for an answer.'), 'stale'],
        ['the turn ended', new GaiaApiError(404, 'gone'), 'stale'],
        ['the PC unreachable', new GaiaNetworkError('https://pc.example:4243/api/chat/confirm-tool', new Error('timeout')), 'unreachable'],
        ['a PC error', new GaiaApiError(500, 'boom'), 'failed'],
    ])('posts a notice when %s, logging no ids', async (_, error, reason) => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const d = deps();
        d.confirm.mockRejectedValue(error);
        await expect(answerFromNotification(action(), d)).resolves.toEqual({ sent: false, reason });
        expect(d.notify).toHaveBeenCalledWith(reason, 's_42');
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).not.toContain(APPROVAL_ID);
        expect(logged).not.toContain('s_42');
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
