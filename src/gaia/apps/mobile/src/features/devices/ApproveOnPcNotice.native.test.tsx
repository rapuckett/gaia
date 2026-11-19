// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { ApproveOnPcNotice } from './ApproveOnPcNotice';
import { seedDevicePrompt, useDevicePromptStore } from './devicePrompts';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = (onRetry = jest.fn()) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <ApproveOnPcNotice kind="admin" action="gpuMemoryApply" onRetry={onRetry} />
            </ThemeProvider>
        </SafeAreaProvider>,
    );

describeNative('ApproveOnPcNotice', () => {
    beforeEach(() => useDevicePromptStore.setState({ states: {}, notes: {} }));

    it('failed: says it was approved but did not finish, with the PC\'s reason as sent, Try again and dismiss', async () => {
        seedDevicePrompt('admin', 'gpuMemoryApply', 'failed', { detail: 'The change could not be written.' });
        const onRetry = jest.fn();
        await mount(onRetry);
        expect(screen.getByText("It was approved on your PC, but it didn't finish.")).toBeTruthy();
        expect(screen.getByText('The change could not be written.')).toBeTruthy();
        fireEvent.press(screen.getByText('Try again'));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(useDevicePromptStore.getState().states['admin\u0000gpuMemoryApply']).toBe('waiting');
    });

    it('busy: warns that the PC waits on another request, with no Try again', async () => {
        seedDevicePrompt('admin', 'gpuMemoryApply', 'busy');
        await mount();
        expect(screen.getByText('Your PC is already waiting for an answer to another request. Answer that one first.')).toBeTruthy();
        expect(screen.queryByText('Try again')).toBeNull();
        await act(async () => fireEvent.press(screen.getByLabelText('Dismiss')));
        expect(screen.queryByTestId('approve-on-pc')).toBeNull();
    });

    it('tooSoon: asks to wait a few seconds, with or without a known wait, and no Try again', async () => {
        seedDevicePrompt('admin', 'gpuMemoryApply', 'tooSoon');
        await mount();
        expect(screen.getByText('You asked for this a moment ago. Wait a few seconds, then try again.')).toBeTruthy();
        expect(screen.queryByText('Try again')).toBeNull();
    });

    it('timeout: says no one answered in time', async () => {
        seedDevicePrompt('admin', 'gpuMemoryApply', 'timeout');
        await mount();
        expect(screen.getByText('No one answered on your PC in time.')).toBeTruthy();
    });
});
