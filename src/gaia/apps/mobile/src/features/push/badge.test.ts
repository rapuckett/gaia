// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ActiveRuns, Session } from '@webui/types';
import { DEFAULT_ALERT_SETTINGS } from '@webui/utils/alertSettings.core';

import { chatBadgeCount } from './badge';

const chat = (id: string, extra: Partial<Session> = {}) => ({ id, ...extra }) as Session;
const idle: ActiveRuns = { session_ids: [], queued: [], awaiting_user: {} };
const modes = DEFAULT_ALERT_SETTINGS.modes;

describe('chatBadgeCount', () => {
    const sessions = [chat('a', { unread: true }), chat('b', { unread: true }), chat('c'), chat('e', { kind: 'eval', unread: true })];
    const active: ActiveRuns = { session_ids: ['c'], queued: [], awaiting_user: { c: 'permission' } };

    it('counts waiting and unread chats, never eval or scheduled ones', () => {
        expect(chatBadgeCount(sessions, active, modes, null)).toBe(3);
        expect(chatBadgeCount(undefined, undefined, modes, null)).toBe(0);
    });

    it('does not count the chat on screen', () => {
        expect(chatBadgeCount(sessions, active, modes, 'a')).toBe(2);
    });

    it('does not count an event type that is turned off', () => {
        expect(chatBadgeCount(sessions, active, { ...modes, finished: 'off' }, null)).toBe(1);
        expect(chatBadgeCount(sessions, active, { ...modes, needs_approval: 'off' }, null)).toBe(2);
        expect(chatBadgeCount(sessions, idle, { ...modes, finished: 'off' }, null)).toBe(0);
    });
});
