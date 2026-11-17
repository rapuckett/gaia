// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { IDLE_TURN, beginTurn, type ChatTurn } from '@/state/chatStreams';

import {
    activeChatId,
    drawerScreenOptions,
    FULL_SCREEN_OPTIONS,
    FULL_SCREEN_ROUTES,
    liveRunsFromTurns,
    openChat,
    openNewChat,
    PERMANENT_DRAWER_MIN_WIDTH,
    PERMANENT_DRAWER_WIDTH,
} from './navigation';

describe('drawer navigation', () => {
    it('opens a chat by replacing the current screen, and New chat goes to /new', () => {
        const router = { replace: jest.fn() };
        openChat(router, 'abc');
        expect(router.replace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'abc' } });
        openNewChat(router);
        expect(router.replace).toHaveBeenLastCalledWith('/new');
    });

    it('reads the open chat from the path', () => {
        expect(activeChatId('/chat/a%20b')).toBe('a b');
        expect(activeChatId('/new')).toBeNull();
        expect(activeChatId('/')).toBeNull();
    });

    it('marks chats live when their turn is not idle, and awaiting when blocked on a prompt', () => {
        const blocked: ChatTurn = { ...beginTurn(), pendingQuestion: { type: 'needs_input', request_id: 'q' } };
        const live = liveRunsFromTurns({ a: beginTurn(), b: IDLE_TURN, c: blocked });
        expect(live.running).toEqual(['a', 'c']);
        expect(Object.keys(live.awaiting)).toEqual(['c']);
    });
});

describe('drawer options by width', () => {
    const at = (width: number, largeText = false) => drawerScreenOptions({ width, largeText, webRtl: false });

    it('is an overlay below 1024, including the old 768 breakpoint', () => {
        for (const width of [320, 390, 768, 1023]) expect(at(width).drawerType).toBe('front');
        expect(at(768).drawerStyle).toBeUndefined();
    });

    it('is a permanent 320 wide sidebar from 1024 up', () => {
        expect(PERMANENT_DRAWER_MIN_WIDTH).toBe(1024);
        for (const width of [1024, 1180, 1366]) {
            expect(at(width).drawerType).toBe('permanent');
            expect(at(width).drawerStyle).toEqual({ width: PERMANENT_DRAWER_WIDTH });
        }
        expect(PERMANENT_DRAWER_WIDTH).toBe(320);
    });

    it('keeps the full-width overlay at large text below the breakpoint only', () => {
        expect(at(768, true).drawerStyle).toEqual({ width: '100%' });
        expect(at(1024, true).drawerStyle).toEqual({ width: PERMANENT_DRAWER_WIDTH });
    });

    it('updates when a rotation crosses 1024', () => {
        expect(at(1024).drawerType).toBe('permanent');
        expect(at(768).drawerType).toBe('front');
    });
});

describe('drawer side', () => {
    const opts = (width: number, webRtl: boolean) => drawerScreenOptions({ width, largeText: false, webRtl });

    it('leaves the side to the navigator in ltr and on native, where it follows the layout direction', () => {
        for (const width of [768, 1024]) expect(opts(width, false).drawerPosition).toBeUndefined();
    });

    it('puts the web sidebar on the right in rtl: overlay by physical side, permanent through the reversed row', () => {
        expect(opts(768, true).drawerPosition).toBe('right');
        expect(opts(1024, true).drawerPosition).toBe('left');
        expect(opts(1024, true).drawerStyle).toEqual({ width: PERMANENT_DRAWER_WIDTH, borderRightWidth: 0 });
    });

    it('shows setup and the startup wait with no sidebar at any width', () => {
        expect(FULL_SCREEN_ROUTES).toEqual(['dev/boot', 'dev/setup']);
        expect(FULL_SCREEN_OPTIONS).toEqual({ drawerType: 'front', swipeEnabled: false });
    });
});
