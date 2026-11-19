// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { SetupNpuProblem, SetupPlan } from '@webui/types';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ALREADY_WAITING_DETAIL, applyDevicePromptEvent, useDevicePromptStore } from '@/features/devices/devicePrompts';
import { ThemeProvider } from '@/ui';

import { NpuNotReady } from './NpuNotReady';

const memlock: SetupNpuProblem = { code: 'memlock', title: '', fix: '', params: { limit: '64 MB', fix: 'apply' } };
const driver: SetupNpuProblem = { code: 'driver', title: '', fix: '', params: {} };
const plan = { catalog: [] } as unknown as SetupPlan;

async function mount(client: ReturnType<typeof createFakeClient>, problems: SetupNpuProblem[], onReady = jest.fn()) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<NpuNotReady problems={problems} onReady={onReady} />, { wrapper: wrap });
    return onReady;
}

describe('NpuNotReady', () => {
    beforeEach(() => useDevicePromptStore.setState({ states: {}, notes: {} }));
    const event = (state: string) => ({ type: 'device_prompt', device_id: 'd1', kind: 'admin', action: 'npuMemlockFix', state });

    it('names each problem with its fix, and offers Raise the limit', async () => {
        await mount(createFakeClient({ npuRecheck: plan }), [driver, memlock]);
        expect(screen.getByText("The NPU driver (amdxdna) isn't loaded.")).toBeTruthy();
        expect(screen.getByText('The locked-memory limit is 64 MB, and the NPU needs it unlimited.')).toBeTruthy();
        expect(screen.getByTestId('npu-fix-memlock')).toBeEnabled();
    });

    it('Raise the limit posts the fix; while the PC asks for the administrator, the notice replaces the button, and the plan comes back when it is answered', async () => {
        const client = createFakeClient({ npuMemlockFix: plan });
        let finish: (p: SetupPlan) => void = () => undefined;
        const fix = jest.spyOn(client, 'fixSetupNpuMemlock').mockReturnValue(new Promise((resolve) => (finish = resolve)));
        const onReady = await mount(client, [memlock]);
        fireEvent.press(screen.getByTestId('npu-fix-memlock'));
        expect(fix).toHaveBeenCalledTimes(1);
        await act(async () => applyDevicePromptEvent(event('waiting')));
        expect(screen.getByText('Approve on your PC')).toBeTruthy();
        expect(screen.queryByTestId('npu-fix-memlock')).toBeNull();
        await act(async () => {
            applyDevicePromptEvent(event('approved'));
            finish(plan);
        });
        await waitFor(() => expect(onReady).toHaveBeenCalledWith(plan));
    });

    it('a busy 409 shows the busy notice and keeps the button; a closed prompt (409 with a code) is the denied notice, not a second error', async () => {
        const client = createFakeClient({ npuMemlockFix: new GaiaApiError(409, ALREADY_WAITING_DETAIL) });
        await mount(client, [memlock]);
        fireEvent.press(screen.getByTestId('npu-fix-memlock'));
        expect(await screen.findByText('Your PC is already waiting for an answer to another request. Answer that one first.')).toBeTruthy();
        expect(screen.getByTestId('npu-fix-memlock')).toBeTruthy();

        jest.spyOn(client, 'fixSetupNpuMemlock').mockImplementation(async () => {
            applyDevicePromptEvent(event('denied'));
            throw new GaiaApiError(409, 'closed', undefined, undefined, { code: 'cancelled', message: 'closed' });
        });
        fireEvent.press(screen.getByTestId('npu-fix-memlock'));
        expect(await screen.findByText("It wasn't approved on your PC.")).toBeTruthy();
        expect(screen.queryByTestId('npu-fix-error')).toBeNull();
    });

    it('with no prompt up, a coded failure shows its own sentence', async () => {
        const client = createFakeClient({ npuMemlockFix: new GaiaApiError(422, 'no pkexec', undefined, undefined, { code: 'no_pkexec', message: 'no pkexec' }) });
        await mount(client, [memlock]);
        fireEvent.press(screen.getByTestId('npu-fix-memlock'));
        expect(await screen.findByText(/polkit isn't installed/)).toBeTruthy();
    });

    it('offers no Raise the limit when the limit is not what is missing', async () => {
        await mount(createFakeClient({ npuRecheck: plan }), [driver]);
        expect(screen.queryByText('Raise the limit')).toBeNull();
    });

    it('Check again reads the NPU on the PC and hands the new plan on', async () => {
        const client = createFakeClient({ npuRecheck: plan });
        const onReady = await mount(client, [driver]);
        fireEvent.press(screen.getByText('Check again'));
        await waitFor(() => expect(onReady).toHaveBeenCalledWith(plan));
        expect(client.npuRechecks).toBe(1);
    });

    it('says so when the check fails, and sends a refused one to the PC', async () => {
        const client = createFakeClient({ npuRecheck: new GaiaApiError(503, 'down') });
        await mount(client, [driver]);
        fireEvent.press(screen.getByText('Check again'));
        await screen.findByText("GAIA couldn't check the NPU again. Make sure the model server is running, then try again.");
    });
});
