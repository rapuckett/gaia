// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initialSelection } from '@webui/components/setup/selection';
import type { SetupCatalogEntry, SetupPlan } from '@webui/types';

import type { AgentDownload } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { indexOfText, tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import type { SetupStepContext } from './SetupScreen';
import { AgentDownloadRow } from './steps/AgentDownloadRow';
import { AgentWait } from './steps/AgentWait';
import { ModelsScreen } from './steps/ModelsScreen';
import { PlanWithScreens } from './steps/PlanScreensHost';
import { usePlanSelection } from './steps/planSelection';

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

const planOf = (...catalog: SetupCatalogEntry[]): SetupPlan => ({
    lemonade: { mode: 'gaia', url: null, reachable: true },
    chat_model: { id: catalog[0]!.id, user_set: false, size_gb: 10, downloaded: false },
    recommended_model: catalog[0]!.id, decided_after_server: false, memory_gb: 64, memory_source: null, options: [], models: [],
    download_gb: 12, disk: { path: '/', free_gb: 500, source: 'local' }, catalog,
});

const wrapper = (plan: SetupPlan) => {
    const client = createFakeClient({ setupPlan: plan, modelServer: { reachable: false } as never });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }: { children: ReactNode }) => (
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
    return Wrapper;
};

const ctxOf = (plan: SetupPlan) => ({ locked: false, plan, run: null, goTo: jest.fn(), startedRun: jest.fn() }) as unknown as SetupStepContext;

beforeEach(() => usePlanSelection.getState().setSelection(null));

describeNative('the plan step accessibility', () => {
    const show = async (plan = planOf(entry({}))) => {
        await render(<PlanWithScreens ctx={ctxOf(plan)} />, { wrapper: wrapper(plan) });
        await screen.findByTestId('plan-card-local');
    };

    it('the two choices are radios that expose which one is checked', async () => {
        await show();
        const radios = touchables().filter((x) => x.role === 'radio');
        expect(radios).toHaveLength(2);
        expect(radios.map((r) => r.checked)).toEqual([true, false]);
        await fireEvent.press(screen.getByText(t('setup.plan.cloud')));
        expect(touchables().filter((x) => x.role === 'radio').map((r) => r.checked)).toEqual([false, true]);
    });

    it('every control is named, has a role and holds 44 pt', async () => {
        await show();
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('reads the title, then the choices, then Customize and Start', async () => {
        await show();
        const title = walk().findIndex((n) => n.props.accessibilityRole === 'header');
        expect(title).toBeGreaterThanOrEqual(0);
        expect(title).toBeLessThan(indexOfText(t('setup.plan.start')));
        const order = walk().map((n) => n.props.testID);
        expect(order.indexOf('plan-card-local')).toBeLessThan(order.indexOf('plan-card-cloud'));
    });

    it('What downloads exposes expanded and flips it', async () => {
        await show();
        const toggle = () => touchables().find((x) => x.expanded !== undefined);
        expect(toggle()?.expanded).toBe(false);
        await fireEvent.press(screen.getByText(toggle()!.name));
        expect(toggle()?.expanded).toBe(true);
    });

    it('the confirm sheet names both answers, holds 44 pt, and has a heading and a modal scrim', async () => {
        await show(planOf(entry({ tight: true })));
        await fireEvent.press(screen.getByText(t('setup.plan.start')));
        await screen.findByTestId('confirm-ok');
        const list = touchables();
        for (const id of ['confirm-ok', 'confirm-cancel']) {
            const x = list.find((c) => c.testID === id);
            expect(x?.role).toBe('button');
            expect(x?.name.trim()).not.toBe('');
        }
        expect(tooSmall(list.filter((c) => /^confirm-/.test(c.testID ?? '')))).toEqual([]);
        expect(walk().some((n) => n.props.accessibilityRole === 'header')).toBe(true);
        expect(walk().some((n) => n.props.accessibilityViewIsModal === true)).toBe(true);
    });
});

describeNative('the models screen accessibility', () => {
    const show = async (plan: SetupPlan) => {
        usePlanSelection.getState().setSelection(initialSelection(plan));
        await render(<ModelsScreen ctx={ctxOf(plan)} close={jest.fn()} />, { wrapper: wrapper(plan) });
        await screen.findByText(t('setup.models.title'));
    };

    it('sections have headings, every control is named, and the backend choice is a radio that exposes checked', async () => {
        await show(planOf(entry({})));
        expect(walk().filter((n) => n.props.accessibilityRole === 'header').length).toBeGreaterThanOrEqual(3);
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        const gpu = list.find((x) => x.role === 'radio' && x.name === t('setup.backend.gpu'));
        expect(gpu?.checked).toBe(true);
    });

    it('a model that will not fit says so on its checkbox and radio, not only in text beside it', async () => {
        await show(planOf(entry({ id: 'big', name: 'Big Chat', fits: false, need_gb: 90, capacity_gb: 64 }), entry({ id: 'tight', name: 'Tight Chat', tight: true, recommended: false })));
        const describe = (name: string) => {
            const node = touchables().find((x) => x.name === name)?.node.props as { accessibilityHint?: string } | undefined;
            return node?.accessibilityHint ?? '';
        };
        expect(describe('Big Chat')).toMatch(/memory|GB|fit/i);
        expect(describe('Tight Chat')).toMatch(/little memory|tight/i);
    });

    it('the keep-trying row is a checkbox that exposes checked and flips it', async () => {
        await show(planOf(entry({})));
        const row = () => touchables().find((x) => x.name === t('setup.keepTrying'));
        expect(row()?.role).toBe('checkbox');
        const before = row()?.checked;
        await fireEvent.press(screen.getByText(t('setup.keepTrying')));
        expect(row()?.checked).toBe(!before);
    });
});

const job = (fields: Partial<AgentDownload>): AgentDownload => ({ state: 'downloading', bytes_done: 40, bytes_total: 100, error: null, ...fields });
const rowIn = (j: AgentDownload) => render(<AgentDownloadRow job={j} name="gaiacpp" onRetry={jest.fn()} />, { wrapper: wrapper(planOf(entry({}))) });

describeNative('the models screen "Other options" link', () => {
    it('is a button that keeps its text height and reaches a 48 pt target through hit slop', async () => {
        const plan = planOf(entry({ reads_images: true }));
        usePlanSelection.getState().setSelection(initialSelection(plan));
        await render(<ModelsScreen ctx={ctxOf(plan)} close={jest.fn()} />, { wrapper: wrapper(plan) });
        await screen.findByText(t('setup.models.title'));
        const link = touchables().find((x) => x.name === t('setup.job.otherVision'));
        expect(link?.role).toBe('button');
        expect(link?.expanded).toBe(false);
        expect(link!.minHeight).toBeGreaterThanOrEqual(48);
        expect((link!.node.props as { style: { minHeight?: number } }).style).not.toHaveProperty('minHeight', 48);
    });
});

describeNative('the agent download row accessibility', () => {
    it('a running download has a progress bar with its value', async () => {
        await rowIn(job({}));
        const bar = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(bar?.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 40 });
        expect(String(bar?.props.accessibilityLabel)).toContain('gaiacpp');
    });

    it('a failure is an alert, and Retry is a named, enabled button at 44 pt', async () => {
        await rowIn(job({ state: 'failed', error: 'checksum mismatch' }));
        expect(walk().some((n) => n.props.accessibilityRole === 'alert')).toBe(true);
        const retry = touchables().find((x) => x.testID === 'agent-download-retry');
        expect(retry?.role).toBe('button');
        expect(retry?.name).toBe(t('setup.progress.retry'));
        expect(tooSmall(touchables())).toEqual([]);
    });

    it('the failure alert comes before Retry in reading order', async () => {
        await rowIn(job({ state: 'failed', error: 'checksum mismatch' }));
        const order = walk();
        expect(order.findIndex((n) => n.props.accessibilityRole === 'alert')).toBeLessThan(order.findIndex((n) => n.props.testID === 'agent-download-retry'));
    });
});

describeNative('the agent wait accessibility', () => {
    const agent = (fields: Record<string, unknown>) => ({
        job: job({ state: 'failed', error: 'checksum mismatch' }), error: null, saving: false, failure: null, interrupted: false, pick: { id: 'gaiacpp', current: 'gaiapy', download: true },
        retryDownload: jest.fn(), carryOn: jest.fn(), retry: jest.fn(), cancel: jest.fn(), ...fields,
    }) as never;

    it('a failed download: heading, then the failure, then Retry and Carry on, all named', async () => {
        await render(<AgentWait agent={agent({})} />, { wrapper: wrapper(planOf(entry({}))) });
        const order = walk();
        const heading = order.findIndex((n) => n.props.accessibilityRole === 'header');
        const alert = order.findIndex((n) => n.props.accessibilityRole === 'alert');
        const carry = order.findIndex((n) => n.props.testID === 'setup-agent-carry-on');
        expect(heading).toBeGreaterThanOrEqual(0);
        expect(heading).toBeLessThan(alert);
        expect(alert).toBeLessThan(carry);
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('a failed save is an alert and Try again follows it', async () => {
        await render(<AgentWait agent={agent({ job: null, error: new Error('no') })} />, { wrapper: wrapper(planOf(entry({}))) });
        const order = walk();
        expect(order.findIndex((n) => n.props.accessibilityRole === 'alert')).toBeLessThan(order.findIndex((n) => n.props.testID === 'setup-agent-try-again'));
    });

    it('Cancel is disabled while saving', async () => {
        await render(<AgentWait agent={agent({ job: job({}), saving: true })} />, { wrapper: wrapper(planOf(entry({}))) });
        const cancel = touchables().find((x) => x.name === t('setup.progress.cancel'));
        expect(cancel?.disabled).toBe(true);
    });
});
