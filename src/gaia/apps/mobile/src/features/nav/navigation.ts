// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LiveRuns } from '@/features/chats/chatList';
import type { ChatTurn } from '@/state/chatStreams';

/** From this width (iPad landscape and up) the chat list stays on screen beside the page; below it the drawer is an overlay. */
export const PERMANENT_DRAWER_MIN_WIDTH = 1024;

/** The permanent sidebar's width. */
export const PERMANENT_DRAWER_WIDTH = 320;

export interface DrawerOptionsInput {
    width: number;
    largeText: boolean;
    /** The web build reads a left-to-right layout manager, so a right-to-left page needs the drawer placed explicitly. */
    webRtl: boolean;
}

/**
 * The sidebar sits on the inline-start side. Native: `drawerPosition` is a physical side that defaults from
 * I18nManager.isRTL, so leave it unset (an explicit value could only disagree with the flipped layout).
 * Web: the overlay slides in by physical `left`/`right`, so rtl needs 'right'; the permanent one is a flex
 * row that the page's dir="rtl" already reverses, so 'left' puts it on the right.
 */
export function drawerPosition(permanent: boolean, webRtl: boolean) {
    if (!webRtl) return undefined;
    return permanent ? ('left' as const) : ('right' as const);
}

/** Setup and the startup wait are full screen at every width: no sidebar, no swipe-in drawer. */
export const FULL_SCREEN_ROUTES: readonly string[] = ['dev/boot', 'dev/setup'];

export const FULL_SCREEN_OPTIONS = { drawerType: 'front' as const, swipeEnabled: false };

export function drawerScreenOptions({ width, largeText, webRtl }: DrawerOptionsInput) {
    const permanent = width >= PERMANENT_DRAWER_MIN_WIDTH;
    return {
        headerShown: false,
        freezeOnBlur: true,
        drawerType: permanent ? ('permanent' as const) : ('front' as const),
        // At large text sizes one word of a label is wider than the default drawer.
        drawerStyle: permanent
            ? { width: PERMANENT_DRAWER_WIDTH, ...(webRtl ? { borderRightWidth: 0 } : null) }
            : largeText
              ? { width: '100%' as const }
              : undefined,
        drawerPosition: drawerPosition(permanent, webRtl),
    };
}

/** Where back lands from a chat opened cold; also the drawer navigator's first route. */
export const INITIAL_ROUTE = 'index';

export interface Navigator {
    replace(href: { pathname: '/chat/[id]'; params: { id: string } } | '/new' | '/'): void;
}

/** Replaces, so back from a chat never walks through every chat visited. */
export function openChat(router: Navigator, sessionId: string): void {
    router.replace({ pathname: '/chat/[id]', params: { id: sessionId } });
}

export function openNewChat(router: Navigator): void {
    router.replace('/new');
}

export function activeChatId(pathname: string): string | null {
    const match = /^\/chat\/([^/]+)\/?$/.exec(pathname);
    return match ? decodeURIComponent(match[1]) : null;
}

/** A chat with a turn that isn't idle is running; one blocked on a prompt is also awaiting. */
export function liveRunsFromTurns(turns: Readonly<Record<string, ChatTurn>>): LiveRuns {
    const running: string[] = [];
    const awaiting: Record<string, true> = {};
    for (const [id, turn] of Object.entries(turns)) {
        if (turn.status === 'idle') continue;
        running.push(id);
        if (turn.pendingPermission || turn.pendingQuestion) awaiting[id] = true;
    }
    return { running, queued: [], awaiting, prompting: [] };
}
