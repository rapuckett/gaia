// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionPrompt } from '../PermissionPrompt';
import { useNotificationStore } from '../../stores/notificationStore';
import { APPROVAL_ARM_MS } from '../../utils/permissionPrompts.core';

const originalRespond = useNotificationStore.getState().respondToPermission;
const respond = vi.fn().mockResolvedValue(undefined);

function raise(id = 'perm-1') {
    useNotificationStore.setState({ notifications: [] });
    useNotificationStore.getState().addNotification({
        id, type: 'permission_request', agentId: 's', sessionId: 's', agentName: 'GAIA',
        title: 'Allow write_file?', message: 'The agent wants to execute: write_file',
        timestamp: 1, read: false, dismissed: false, priority: 'high',
        tool: 'write_file', toolArgs: { file_path: 'notes.txt', content: 'x' }, alwaysScope: 'write_file on notes.txt',
    });
}

const answers = () => [
    screen.getByRole('button', { name: 'Allow once' }),
    screen.getByRole('button', { name: /^Always allow/ }),
    screen.getByRole('button', { name: 'Deny' }),
];
// A mouse or touch click carries its click count; one from the keyboard or a screen reader carries 0.
const tap = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useNotificationStore.setState({ notifications: [], respondToPermission: respond });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useNotificationStore.setState({ notifications: [], respondToPermission: originalRespond });
});

describe('PermissionPrompt arm wait', () => {
    it('ignores every mouse click until the card has been still for the arm wait, then answers', () => {
        raise();
        render(<PermissionPrompt sessionId="s" />);
        answers().forEach(tap);
        wait(APPROVAL_ARM_MS - 1);
        answers().forEach(tap);
        expect(respond).not.toHaveBeenCalled();
        expect(screen.getByRole('alertdialog').hasAttribute('data-armed')).toBe(false);

        wait(1);
        expect(screen.getByRole('alertdialog').getAttribute('data-armed')).toBe('true');
        tap(screen.getByRole('button', { name: 'Allow once' }));
        expect(respond.mock.calls).toEqual([['perm-1', 'allow']]);
    });

    it('takes a keyboard or screen reader click at once', () => {
        raise();
        render(<PermissionPrompt sessionId="s" />);
        fireEvent.click(screen.getByRole('button', { name: /^Always allow/ }));
        expect(respond.mock.calls).toEqual([['perm-1', 'always']]);
    });

    it('arms a prompt that replaces an armed one afresh', () => {
        raise('perm-1');
        render(<PermissionPrompt sessionId="s" />);
        wait(APPROVAL_ARM_MS);
        act(() => raise('perm-2'));
        answers().forEach(tap);
        expect(respond).not.toHaveBeenCalled();
        wait(APPROVAL_ARM_MS);
        tap(screen.getByRole('button', { name: 'Deny' }));
        expect(respond.mock.calls).toEqual([['perm-2', 'deny']]);
    });

    it('starts the wait again when the card or the column below it changes size', () => {
        let resized: () => void = () => {};
        const watched: Element[] = [];
        vi.stubGlobal('ResizeObserver', class {
            constructor(cb: () => void) { resized = cb; }
            observe(el: Element) { watched.push(el); }
            disconnect() {}
        });
        raise();
        render(
            <div data-testid="column">
                <PermissionPrompt sessionId="s" />
                <textarea aria-label="composer" />
            </div>,
        );
        expect(watched).toEqual([screen.getByRole('alertdialog'), screen.getByTestId('column')]);
        wait(APPROVAL_ARM_MS);
        act(() => resized());
        tap(screen.getByRole('button', { name: /^Always allow/ }));
        expect(respond).not.toHaveBeenCalled();
        wait(APPROVAL_ARM_MS);
        tap(screen.getByRole('button', { name: /^Always allow/ }));
        expect(respond.mock.calls).toEqual([['perm-1', 'always']]);
    });

    it('still denies on Esc at once', () => {
        raise();
        render(<PermissionPrompt sessionId="s" />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(respond.mock.calls).toEqual([['perm-1', 'deny']]);
    });
});
