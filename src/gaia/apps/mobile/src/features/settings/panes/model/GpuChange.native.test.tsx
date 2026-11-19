// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { GpuMemoryStatus } from '@webui/types';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ALREADY_WAITING_DETAIL, applyDevicePromptEvent, useDevicePromptStore } from '@/features/devices/devicePrompts';
import { GPU } from '@/features/setup/devScenes';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { GpuChange } from './GpuChange';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const LINUX: GpuMemoryStatus = { ...GPU, os: 'linux', method: 'apply', revert: { available: true, previous_setting_gb: 16 } };
const event = (state: string, action = 'gpuMemoryApply') => ({ type: 'device_prompt', device_id: 'd1', kind: 'admin', action, state });

async function mount(status: GpuMemoryStatus, target: number | null = 48) {
    const client = createFakeClient({ gpuMemory: status });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<GpuChange status={status} target={target} />, { wrapper: wrap });
    return { client, queryClient };
}

describeNative('GpuChange', () => {
    beforeEach(() => useDevicePromptStore.setState({ states: {}, notes: {} }));
    afterEach(() => act(() => sheetStore.reset()));

    it('Apply asks first, then sends the size with confirm; the notice stands in for the button while the PC asks', async () => {
        const { client, queryClient } = await mount(LINUX);
        let finish: (s: GpuMemoryStatus) => void = () => undefined;
        const apply = jest.spyOn(client, 'applyGpuMemory').mockReturnValue(new Promise((resolve) => (finish = resolve)));

        await fireEvent.press(screen.getByTestId('gpu-apply'));
        expect(await screen.findByText(/^Give the GPU .*48.* GB\?$/)).toBeTruthy();
        expect(apply).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByTestId('confirm-ok'));
        await waitFor(() => expect(apply).toHaveBeenCalledWith(48));

        await act(async () => applyDevicePromptEvent(event('waiting')));
        expect(screen.getByText('Approve on your PC')).toBeTruthy();
        expect(screen.queryByTestId('gpu-apply')).toBeNull();
        expect(screen.queryByTestId('gpu-undo')).toBeNull();

        await act(async () => {
            applyDevicePromptEvent(event('approved'));
            finish({ ...LINUX, pending: { setting_gb: 48, previous_setting_gb: 16, source: 'apply', recorded_at: 'now', state: 'restart_required' } });
        });
        expect(await screen.findByText(/^Done\. Restart your PC to use .*48.* GB\.$/)).toBeTruthy();
        queryClient.clear();
    });

    it('Cancel in the confirm sends nothing', async () => {
        const { client, queryClient } = await mount(LINUX);
        const apply = jest.spyOn(client, 'applyGpuMemory');
        await fireEvent.press(screen.getByTestId('gpu-apply'));
        await fireEvent.press(await screen.findByTestId('confirm-cancel'));
        expect(apply).not.toHaveBeenCalled();
        expect(client.gpuMemoryChanges).toEqual([]);
        queryClient.clear();
    });

    it('Undo asks first, then reverts on the PC', async () => {
        const { client, queryClient } = await mount(LINUX);
        await fireEvent.press(screen.getByTestId('gpu-undo'));
        expect(await screen.findByText('Undo the GPU memory change?')).toBeTruthy();
        expect(client.gpuMemoryChanges).toEqual([]);
        await fireEvent.press(screen.getByTestId('confirm-ok'));
        await waitFor(() => expect(client.gpuMemoryChanges).toEqual([{ action: 'revert' }]));
        queryClient.clear();
    });

    it('a step that fails after approval shows the failed notice with the PC\'s sentence as sent', async () => {
        const { client, queryClient } = await mount(LINUX);
        let fail: (e: Error) => void = () => undefined;
        jest.spyOn(client, 'applyGpuMemory').mockReturnValue(new Promise((_, reject) => (fail = reject)));
        await fireEvent.press(screen.getByTestId('gpu-apply'));
        await fireEvent.press(await screen.findByTestId('confirm-ok'));
        await act(async () => applyDevicePromptEvent(event('waiting')));
        await act(async () => fail(new GaiaApiError(500, 'GAIA could not change the GPU memory setting.')));
        expect(await screen.findByText("It was approved on your PC, but it didn't finish.")).toBeTruthy();
        expect(screen.getByText('GAIA could not change the GPU memory setting.')).toBeTruthy();
        queryClient.clear();
    });

    it('a busy 409 shows the busy notice and leaves Apply; another 409 is an ordinary error', async () => {
        const { client, queryClient } = await mount(LINUX);
        const apply = jest.spyOn(client, 'applyGpuMemory').mockRejectedValueOnce(new GaiaApiError(409, ALREADY_WAITING_DETAIL));
        await fireEvent.press(screen.getByTestId('gpu-apply'));
        await fireEvent.press(await screen.findByTestId('confirm-ok'));
        expect(await screen.findByText('Your PC is already waiting for an answer to another request. Answer that one first.')).toBeTruthy();
        expect(screen.getByTestId('gpu-apply')).toBeTruthy();

        apply.mockRejectedValueOnce(new GaiaApiError(409, 'GPU memory is already set to that size.'));
        await fireEvent.press(screen.getByTestId('gpu-apply'));
        await fireEvent.press(await screen.findByTestId('confirm-ok'));
        expect(await screen.findByText('GPU memory is already set to that size.')).toBeTruthy();
        queryClient.clear();
    });

    it('shows no Apply on a PC where GAIA only guides the change', async () => {
        await mount({ ...GPU, revert: { available: false, previous_setting_gb: null } });
        expect(screen.queryByTestId('gpu-apply')).toBeNull();
        expect(screen.queryByTestId('gpu-undo')).toBeNull();
    });
});
