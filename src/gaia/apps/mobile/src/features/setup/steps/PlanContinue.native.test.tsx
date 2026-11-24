// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SetupCatalogEntry, SetupPlan } from '@webui/types';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import type { SetupStepContext } from '../SetupScreen';
import { PlanWithScreens } from './PlanScreensHost';
import { usePlanSelection } from './planSelection';

jest.mock('react-native-safe-area-context', () => ({
    ...jest.requireActual('react-native-safe-area-context'),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const entry = (e: Partial<SetupCatalogEntry>): SetupCatalogEntry => ({
    id: 'chat', name: 'Big Chat', roles: ['chat'], purpose: '', if_skipped: null, recipe: null, size_gb: 10, full_size_gb: 10,
    partial: false, partial_gb: 0, downloaded: false, in_lemonade: false, recommended: true, planned: true,
    gaia_model: true, selected: true, skipped: false, chat_choice: true, support: 'verified', reads_images: true,
    feature_tier: 'full', source: null, fits: true, need_gb: 12, capacity_gb: 64, fit_reason: null, setup_offer: true, ...e,
});

const planOf = (chat: SetupCatalogEntry): SetupPlan => ({
    lemonade: { mode: 'gaia', url: null, reachable: true },
    chat_model: { id: chat.id, user_set: false, size_gb: 10, downloaded: false },
    recommended_model: chat.id, decided_after_server: false, memory_gb: 64, memory_source: null, options: [], models: [],
    download_gb: 12, disk: { path: '/', free_gb: 500, source: 'local' }, catalog: [chat],
});

const show = async (chat: SetupCatalogEntry) => {
    const plan = planOf(chat);
    const client = createFakeClient({ setupPlan: plan, modelServer: { reachable: false } as never });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider><SheetHost>{children}</SheetHost></ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    const ctx = { locked: false, plan, run: null, goTo: jest.fn(), startedRun: jest.fn() } as unknown as SetupStepContext;
    await render(<PlanWithScreens ctx={ctx} />, { wrapper: wrap });
    fireEvent.press(await screen.findByText(t('setup.plan.start')));
    return client;
};

beforeEach(() => usePlanSelection.getState().setSelection(null));

describeNative("the plan's Continue", () => {
    it('asks about a tight model first and starts no download until the answer is yes', async () => {
        const client = await show(entry({ tight: true }));
        expect(await screen.findByText(/leaves your other apps little memory/)).toBeTruthy();
        expect(client.setupStarts).toHaveLength(0);
        fireEvent.press(screen.getByTestId('confirm-ok'));
        await waitFor(() => expect(client.setupStarts).toHaveLength(1));
    });

    it('starts nothing when the tight question is declined', async () => {
        const client = await show(entry({ tight: true }));
        fireEvent.press(await screen.findByTestId('confirm-cancel'));
        await waitFor(() => expect(screen.queryByTestId('confirm-ok')).toBeNull());
        expect(client.setupStarts).toHaveLength(0);
    });

    it('blocks a model that cannot run on this PC with the reason, without asking', async () => {
        const client = await show(entry({ fits: false, fit_code: 'backend' }));
        expect(await screen.findByText(/can't run on this PC/)).toBeTruthy();
        expect(screen.queryByTestId('confirm-ok')).toBeNull();
        expect(client.setupStarts).toHaveLength(0);
    });
});
