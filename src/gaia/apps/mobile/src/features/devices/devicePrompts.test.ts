// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react-native';

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';

import { ALREADY_WAITING_DETAIL, applyDevicePromptEvent, deviceHaptics, useDevicePrompt, useDevicePromptStore } from './devicePrompts';

const denied = jest.spyOn(deviceHaptics, 'denied').mockImplementation(() => undefined);

const event = (state: string, kind = 'keyStore', action = 'providerKeyRetry') => ({ type: 'device_prompt', device_id: 'd1', kind, action, state });

describe('useDevicePrompt', () => {
    beforeEach(() => {
        useDevicePromptStore.setState({ states: {}, notes: {} });
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

    it('takes the failed state the PC now sends, and keeps the action hidden for it', async () => {
        const { result } = await renderHook(() => useDevicePrompt({ kind: 'admin', action: 'gpuMemoryApply' }));
        await act(async () => applyDevicePromptEvent(event('failed', 'admin', 'gpuMemoryApply')));
        expect(result.current.state).toBe('failed');
        expect(result.current.hideAction).toBe(true);
    });

    describe('report', () => {
        const hook = () => renderHook(() => useDevicePrompt({ kind: 'admin', action: 'gpuMemoryApply' }));

        it('a 409 with the PC\'s busy sentence is busy and leaves the button; any other 409 is left to the caller', async () => {
            const { result } = await hook();
            let consumed = true;
            await act(async () => {
                consumed = result.current.report(new GaiaApiError(409, 'GPU memory is managed by hand on this PC.'));
            });
            expect(consumed).toBe(false);
            await act(async () => {
                consumed = result.current.report(new GaiaApiError(409, ALREADY_WAITING_DETAIL));
            });
            expect(consumed).toBe(true);
            expect(result.current.state).toBe('busy');
            expect(result.current.hideAction).toBe(false);
        });

        it('a 429 keeps the seconds to wait, from Retry-After, else from the sentence', async () => {
            const { result } = await hook();
            await act(async () => void result.current.report(new GaiaApiError(429, 'This was just tried. Wait 9 s, then try again.', undefined, undefined, null, 8)));
            expect(result.current.state).toBe('tooSoon');
            expect(result.current.note.seconds).toBe(8);
            await act(async () => void result.current.report(new GaiaApiError(429, 'This was just tried. Wait 9 s, then try again.')));
            expect(result.current.note.seconds).toBe(9);
        });

        it('while the PC\'s prompt is up, an HTTP error becomes the failed reason, a 504 the timeout, and a dropped connection nothing', async () => {
            const { result } = await hook();
            await act(async () => applyDevicePromptEvent(event('waiting', 'admin', 'gpuMemoryApply')));
            await act(async () => void result.current.report(new GaiaNetworkError('http://pc', 'lost')));
            expect(result.current.state).toBe('waiting');
            await act(async () => void result.current.report(new GaiaApiError(500, 'The change could not be written.')));
            expect(result.current.state).toBe('failed');
            expect(result.current.note.detail).toBe('The change could not be written.');
            await act(async () => result.current.dismiss());
            await act(async () => applyDevicePromptEvent(event('waiting', 'admin', 'gpuMemoryApply')));
            await act(async () => void result.current.report(new GaiaApiError(504, 'timed out')));
            expect(result.current.state).toBe('timeout');
        });

        it('with no prompt up, an error is the caller\'s to show; settle ends a waiting the PC never closed', async () => {
            const { result } = await hook();
            let consumed = true;
            await act(async () => {
                consumed = result.current.report(new GaiaApiError(500, 'x'));
            });
            expect(consumed).toBe(false);
            await act(async () => applyDevicePromptEvent(event('waiting', 'admin', 'gpuMemoryApply')));
            await act(async () => result.current.settle());
            expect(result.current.state).toBe('idle');
        });
    });
});
