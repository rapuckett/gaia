// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initialSelection } from '@webui/components/setup/selection';
import type { AgentPrograms, SetupCatalogEntry, SetupPlan } from '@webui/types';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import type { SetupStepContext } from '../SetupScreen';
import { ModelsScreen } from './ModelsScreen';
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
    partial: false, partial_gb: 0, downloaded: false, in_lemonade: false, recommended: false, planned: false,
    gaia_model: true, selected: false, skipped: false, chat_choice: true, support: 'verified', reads_images: true,
    feature_tier: 'full', source: null, fits: true, need_gb: 12, capacity_gb: 64, fit_reason: null, setup_offer: true, ...e,
});

// The untested model is listed first in the catalog, so only the fold's rule can put it last.
const CATALOG = [
    entry({ id: 'mine', name: 'Untested One', support: 'untested' }),
    entry({ id: 'big', name: 'Verified Big', recommended: true, planned: true, selected: true }),
    entry({ id: 'small', name: 'Verified Small' }),
];
const PLAN: SetupPlan = {
    lemonade: { mode: 'gaia', url: null, reachable: true },
    chat_model: { id: 'big', user_set: false, size_gb: 10, downloaded: false },
    recommended_model: 'big', decided_after_server: false, memory_gb: 64, memory_source: null, options: [], models: [],
    download_gb: 12, disk: { path: '/', free_gb: 500, source: 'local' }, catalog: CATALOG,
};
const AGENTS = (current: string): AgentPrograms => ({
    current,
    programs: [
        { id: 'gaiapy', installed: true, size_bytes: 1, can_download: false, unavailable_reason: null, unavailable_code: null },
        { id: 'gaiacpp', installed: false, size_bytes: 1, can_download: true, unavailable_reason: null, unavailable_code: null },
    ],
    download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
});

const mount = async (ui: ReactElement, data: FakeClientData) => {
    const client = createFakeClient({ setupPlan: PLAN, modelServer: { reachable: false } as never, ...data });
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
    await render(ui, { wrapper: wrap });
};
const ctx = { locked: false, plan: PLAN, run: null, goTo: jest.fn(), startedRun: jest.fn() } as unknown as SetupStepContext;

beforeEach(() => usePlanSelection.getState().setSelection(null));

describeNative('the plan names the agent', () => {
    it('shows the agent in use and Change opens Customize', async () => {
        await mount(<PlanWithScreens ctx={ctx} />, { agentPrograms: AGENTS('gaiapy') });
        expect(await screen.findByText(`Agent: ${t('setup.agent.gaiapy')}`)).toBeTruthy();
        fireEvent.press(screen.getByLabelText(t('setup.plan.agentChangeAria')));
        expect(await screen.findByText(t('setup.models.title'))).toBeTruthy();
    });

    it('names gaiacpp when that is the agent', async () => {
        await mount(<PlanWithScreens ctx={ctx} />, { agentPrograms: AGENTS('gaiacpp') });
        expect(await screen.findByText(`Agent: ${t('setup.agent.gaiacpp')}`)).toBeTruthy();
    });

    it('leaves the line out when gaiacpp is not on offer', async () => {
        const only = AGENTS('gaiapy');
        only.programs[1] = { ...only.programs[1], can_download: false };
        await mount(<PlanWithScreens ctx={ctx} />, { agentPrograms: only });
        await screen.findByText(t('setup.plan.start'));
        expect(screen.queryByTestId('plan-agent')).toBeNull();
    });
});

describeNative('Customize folds untested models', () => {
    it('lists verified first, hides untested until the toggle, and counts them', async () => {
        usePlanSelection.getState().setSelection(initialSelection(PLAN));
        await mount(<ModelsScreen ctx={ctx} close={() => undefined} />, { agentPrograms: AGENTS('gaiapy') });
        // The model checklist below lists every model too, so the fold is judged by its own note and the row count.
        await screen.findAllByText(t('setup.job.verifiedNote'));
        const rows = (name: string) => screen.queryAllByText(name).length;
        const before = rows('Untested One');
        expect(rows('Verified Big')).toBeGreaterThan(0);
        expect(rows('Verified Small')).toBeGreaterThan(0);
        expect(screen.queryByText(t('setup.job.untestedNote'))).toBeNull();
        fireEvent.press(screen.getByLabelText(t('setup.job.showUntested', { n: '1' })));
        expect(await screen.findByText(t('setup.job.untestedNote'))).toBeTruthy();
        expect(rows('Untested One')).toBeGreaterThan(before);
    });
});
