// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react-native';

import { applyDevicePromptEvent, deviceHaptics, useDevicePrompt, useDevicePromptStore } from './devicePrompts';

const denied = jest.spyOn(deviceHaptics, 'denied').mockImplementation(() => undefined);

const event = (state: string, kind = 'keyStore', action = 'providerKeyRetry') => ({ type: 'device_prompt', device_id: 'd1', kind, action, state });

describe('useDevicePrompt', () => {
    beforeEach(() => {
        useDevicePromptStore.setState({ states: {} });
        denied.mockClear();
    });

    it('follows the PC: idle, waiting, then approved, with no state of its own', async () => {
        const { result } = await renderHook(() => useDevicePrompt({ kind: 'keyStore', action: 'providerKeyRetry' }));
        expect(result.current.state).toBe('idle');
        await act(async () => applyDevicePromptEvent(event('waiting')));
        expect(result.current.waiting).toBe(true);
        await act(async () => applyDevicePromptEvent(event('approved')));
        expect(result.current.state).toBe('approved');
        expect(result.current.waiting).toBe(false);
        expect(result.current.hideAction).toBe(false);
    });

    it('hides the action while waiting or after an outcome, until dismissed', async () => {
        const { result } = await renderHook(() => useDevicePrompt({ kind: 'keyStore', action: 'providerKeyRetry' }));
        expect(result.current.hideAction).toBe(false);
        for (const state of ['waiting', 'denied', 'timeout', 'cancelled']) {
            await act(async () => applyDevicePromptEvent(event(state)));
            expect(result.current.hideAction).toBe(true);
        }
        await act(async () => result.current.dismiss());
        expect(result.current.state).toBe('idle');
        expect(result.current.hideAction).toBe(false);
    });

    it('keeps the state for a screen that mounts later, and keeps kinds and actions apart', async () => {
        applyDevicePromptEvent(event('waiting'));
        const same = await renderHook(() => useDevicePrompt({ kind: 'keyStore', action: 'providerKeyRetry' }));
        const otherKind = await renderHook(() => useDevicePrompt({ kind: 'admin', action: 'providerKeyRetry' }));
        const otherAction = await renderHook(() => useDevicePrompt({ kind: 'keyStore', action: 'connectorTest' }));
        expect(same.result.current.state).toBe('waiting');
        expect(otherKind.result.current.state).toBe('idle');
        expect(otherAction.result.current.state).toBe('idle');
    });

    it('buzzes once when a prompt is denied, and for no other outcome', async () => {
        applyDevicePromptEvent(event('waiting'));
        applyDevicePromptEvent(event('timeout'));
        applyDevicePromptEvent(event('approved'));
        expect(denied).not.toHaveBeenCalled();
        applyDevicePromptEvent(event('denied'));
        applyDevicePromptEvent(event('denied'));
        expect(denied).toHaveBeenCalledTimes(1);
    });

    it('stops waiting and restarts on the phone, and ignores malformed or unrelated events', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { result } = await renderHook(() => useDevicePrompt({ kind: 'admin', action: 'gpuMemoryApply' }));
        await act(async () => applyDevicePromptEvent(event('waiting', 'admin', 'gpuMemoryApply')));
        await act(async () => result.current.stopWaiting());
        expect(result.current.state).toBe('cancelled');
        await act(async () => result.current.restart());
        expect(result.current.waiting).toBe(true);
        await act(async () => applyDevicePromptEvent(event('paused', 'admin', 'gpuMemoryApply')));
        await act(async () => applyDevicePromptEvent({ type: 'set_active_session', session_id: 's' }));
        expect(result.current.waiting).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
