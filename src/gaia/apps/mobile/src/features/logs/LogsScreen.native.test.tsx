// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { LOG_SCENES, logSceneClient } from './devScenes';
import { LogsScreen } from './LogsScreen';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

function wrapFor(scene: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = logSceneClient(LOG_SCENES[scene]!);
    return function Wrap({ children }: { children: ReactNode }) {
        return (
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
                </QueryClientProvider>
            </ThemeProvider>
        </SafeAreaProvider>
        );
    };
}

describeNative('LogsScreen', () => {
    it('shows the PC lines, and only the warnings and errors once the filter is on', async () => {
        const scene = LOG_SCENES.errors!;
        await render(<LogsScreen onBack={() => {}} initialSource={scene.source} initialFollow={false} />, { wrapper: wrapFor('errors') });
        expect(await screen.findByText(/free memory is low/)).toBeTruthy();
        expect(screen.getByText(/turn started/)).toBeTruthy();
        await fireEvent.press(screen.getByTestId('log-problems-only'));
        expect(screen.queryByText(/turn started/)).toBeNull();
        expect(screen.getByText(/permission denied/)).toBeTruthy();
    });

    it('shows the PC\'s reason when the log is unavailable, and the failure, never an empty log, when the read fails', async () => {
        const down = await render(<LogsScreen onBack={() => {}} initialSource="model_server" initialFollow={false} />, { wrapper: wrapFor('unavailable') });
        expect(await screen.findByText(/Connection refused/)).toBeTruthy();
        expect(screen.queryByTestId('log-empty')).toBeNull();
        await down.unmount();

        await render(<LogsScreen onBack={() => {}} initialSource="gaia" initialFollow={false} />, { wrapper: wrapFor('failed') });
        expect(await screen.findByText(/No Lemonade Server is chosen yet/)).toBeTruthy();
        expect(screen.queryByTestId('log-empty')).toBeNull();
    });

    it('keeps Save all logs on the PC', async () => {
        const view = await render(<LogsScreen onBack={() => {}} />, { wrapper: wrapFor('errors') });
        await fireEvent.press(await view.findByTestId('logs-save-all'));
        expect(await view.findByTestId('logs-save-all-refusal')).toBeTruthy();
    });
});
