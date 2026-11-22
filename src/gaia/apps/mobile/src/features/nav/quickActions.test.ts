// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { renderHook } from '@testing-library/react-native';

import { quickActions, type QuickActionsNative } from '../../../modules/gaia-quick-actions';
import { NEW_CHAT_ACTION, quickActionItems, useQuickActionItems, useQuickActionRouting } from './quickActions';

jest.mock('../../../modules/gaia-quick-actions', () => ({ quickActions: jest.fn(() => null) }));

/** The native module as it behaves: one pending action, taken once, and events to whoever listens. */
function fakeNative(pending: string | null) {
    let inbox = pending;
    const listeners = new Set<(event: { id: string }) => void>();
    const native = {
        setItems: jest.fn(async () => {}),
        takePending: jest.fn(() => {
            const id = inbox;
            inbox = null;
            return id;
        }),
        addListener: jest.fn((_event: 'onAction', listener: (event: { id: string }) => void) => {
            listeners.add(listener);
            return { remove: () => listeners.delete(listener) };
        }),
    } satisfies QuickActionsNative;
    jest.mocked(quickActions).mockReturnValue(native);
    return { native, fire: (id: string) => listeners.forEach((l) => l({ id })) };
}

const router = () => ({ replace: jest.fn() });

describe('quick action items', () => {
    it('titles New chat with the drawer’s label in each language', () => {
        expect(quickActionItems('en')).toEqual([{ id: NEW_CHAT_ACTION, title: 'New chat' }]);
        expect(quickActionItems('ar')).toEqual([{ id: NEW_CHAT_ACTION, title: 'محادثة جديدة' }]);
    });

    it('sets them at startup and again when the language changes', async () => {
        const { native } = fakeNative(null);
        const { rerender } = await renderHook(({ locale }: { locale: string | null }) => useQuickActionItems(locale), {
            initialProps: { locale: null as string | null },
        });
        expect(native.setItems).not.toHaveBeenCalled();
        await rerender({ locale: 'en' });
        await rerender({ locale: 'ar' });
        expect(native.setItems.mock.calls).toEqual([
            [[{ id: NEW_CHAT_ACTION, title: 'New chat' }]],
            [[{ id: NEW_CHAT_ACTION, title: 'محادثة جديدة' }]],
        ]);
    });
});

describe('quick action routing', () => {
    it('opens New chat the way the drawer’s button does, for the action that cold-started the app, once', async () => {
        fakeNative(NEW_CHAT_ACTION);
        const nav = router();
        const first = await renderHook(() => useQuickActionRouting(nav));
        expect(nav.replace.mock.calls).toEqual([['/new']]);
        await first.unmount();
        await renderHook(() => useQuickActionRouting(nav));
        expect(nav.replace).toHaveBeenCalledTimes(1);
    });

    it('opens New chat for an action chosen while the app runs', async () => {
        const { fire } = fakeNative(null);
        const nav = router();
        await renderHook(() => useQuickActionRouting(nav));
        expect(nav.replace).not.toHaveBeenCalled();
        fire(NEW_CHAT_ACTION);
        expect(nav.replace.mock.calls).toEqual([['/new']]);
    });

    it('stops listening when it unmounts, and refuses an action it doesn’t know loudly', async () => {
        const { fire } = fakeNative(null);
        const nav = router();
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const hook = await renderHook(() => useQuickActionRouting(nav));
        fire('unknown');
        expect(error).toHaveBeenCalledWith(expect.stringContaining('"unknown"'));
        await hook.unmount();
        fire(NEW_CHAT_ACTION);
        expect(nav.replace).not.toHaveBeenCalled();
        error.mockRestore();
    });

    it('does nothing where there is no native module (web, older builds)', async () => {
        jest.mocked(quickActions).mockReturnValue(null);
        const nav = router();
        await renderHook(() => useQuickActionRouting(nav));
        expect(nav.replace).not.toHaveBeenCalled();
    });
});
