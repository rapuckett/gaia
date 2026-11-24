// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider, useSetupPlan, useSetupStatus } from '@/data';
import { ThemeProvider } from '@/ui';

import { SETUP_SCENES_B } from './devScenesB';
import { setupSceneClient } from './devScenes';
import { SetupFooterBar, SetupFooterProvider } from './SetupFooter';
import type { SetupStepContext } from './SetupScreen';
import { usePlanScreenRequest } from './steps/planScreenRequest';
import { SETUP_STEPS } from './steps';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

function Step({ stage }: { stage: keyof typeof SETUP_STEPS }) {
    const run = useSetupStatus().data ?? null;
    const plan = useSetupPlan().data;
    const Body = SETUP_STEPS[stage]!;
    const ctx: SetupStepContext = { stage, run, plan, locked: false, again: false, goTo: () => undefined, startedRun: () => undefined, finish: () => undefined };
    return <Body ctx={ctx} />;
}

async function mount(key: string, withClient?: ReturnType<typeof createFakeClient>) {
    const found = SETUP_SCENES_B[key]!;
    if (found.screen) usePlanScreenRequest.getState().request({ screen: found.screen, from: 'check' });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={withClient ?? setupSceneClient(found)}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<SetupFooterProvider><Step stage={found.stage} /><SetupFooterBar /></SetupFooterProvider>, { wrapper: wrap });
}

const SHOWS: Record<string, RegExp> = {
    'check/installing': /Now: /,
    'download/extras-left': /Skip the extras/,
    'download/logs': /Having trouble\?/,
    'gpu/guided-linux': /Show me how/,
    'gpu/not-applied': /may not have applied/,
    'gpu/restart': /Restart your PC to use/,
    'gpu/took-effect': /GPU memory is now/,
    'key/env': /Found a .*Fireworks AI.* key in your PC's environment/,
    'key/env-unnamed': /Found a .*Fireworks AI.* key in your PC's environment\. Test and connect/,
    'key/gateway': /How to get an AMD LLM Gateway key/,
    'key/gateway-down': /Check the AMD gateway again/,
    'plan/blocked': /can't run GAIA's models/,
    'ready/extra-downloading': /Still downloading: Whisper Large v3 Turbo/,
    'ready/gpu-now': /GPU memory is now/,
    'ready/gpu-restart': /Restart your PC to use/,
    'ready/not-installed': /Not installed \(add later in Settings\)/,
    'ready/test-failed': /Failed its test/,
};

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('setup gallery scenes, batch B', () => {
    beforeEach(() => usePlanScreenRequest.getState().clear());

    it('has a check for every scene', () => {
        expect(Object.keys(SHOWS).sort()).toEqual(Object.keys(SETUP_SCENES_B).sort());
    });

    it.each(Object.keys(SHOWS))('renders %s', async (key) => {
        await mount(key);
        await waitFor(() => expect(screen.getAllByText(SHOWS[key]!).length).toBeGreaterThan(0));
    });

    it('finishes without the extras by skipping them and starting the run again', async () => {
        const found = SETUP_SCENES_B['download/extras-left']!;
        const client = setupSceneClient(found) as ReturnType<typeof createFakeClient>;
        await mount('download/extras-left', client);
        fireEvent.press(await screen.findByTestId('download-finish-without-extras'));
        await waitFor(() => expect(client.setupStarts).toHaveLength(1));
        expect(client.setupChoices).toEqual([{ kind: 'skip', modelId: 'Whisper-Large-v3-Turbo', flag: true }]);
    });

    it('offers no Finish without extras on a run that stopped on a model setup needs, or while extras download', async () => {
        await mount('download/logs');
        await screen.findByText(/Having trouble\?/);
        expect(screen.queryByTestId('download-finish-without-extras')).toBeNull();
    });

    it('opens the numbered steps with a Copy button for the command', async () => {
        await mount('gpu/guided-linux');
        fireEvent.press(await screen.findByTestId('gpu-show-me'));
        await waitFor(() => expect(screen.getByText('Copy')).toBeTruthy());
    });
});
