// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SetupCatalogEntry, SetupPlan } from '@webui/types';

import type { AgentProgram, AgentPrograms, ProviderModel } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { AgentChoice } from './AgentChoice';
import { LocalModels } from './LocalModels';
import { ModelRow } from './ModelRow';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

function mounter(data: FakeClientData = {}) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
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
    return { wrapper };
}

const PY: AgentProgram = { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null };
const CPP: AgentProgram = { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null };
const programs = (cpp: Partial<AgentProgram> = {}, download: AgentPrograms['download'] = { state: 'idle', bytes_done: 0, bytes_total: null, error: null }): AgentPrograms => ({
    current: 'gaiapy', programs: [PY, { ...CPP, ...cpp }], download,
});

describeNative('AgentChoice accessibility', () => {
    it('is a radio group of named radios, one checked, and a labeled Download beside the row', async () => {
        await render(<AgentChoice inSettings />, mounter({ agentPrograms: programs() }));
        await screen.findByTestId('agent-choice-gaiacpp');
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        const radios = list.filter((t) => t.role === 'radio');
        expect(radios.map((r) => r.checked)).toEqual([true, false]);
        expect(walk().some((n) => n.props.accessibilityRole === 'radiogroup')).toBe(true);
        const download = list.find((t) => t.testID === 'agent-choice-download');
        expect(download?.role).toBe('button');
        expect(download?.name).toMatch(/gaiacpp/);
        // The Download button sits beside the radio, not inside it, so a screen reader can reach both.
        const row = walk().find((n) => n.props.testID === 'agent-choice-gaiacpp')!;
        expect(JSON.stringify(row)).not.toContain('agent-choice-download');
    });

    it('a not-yet-downloaded agent says so in the radio itself', async () => {
        await render(<AgentChoice inSettings />, mounter({ agentPrograms: programs() }));
        const cpp = (await screen.findByTestId('agent-choice-gaiacpp')).props as { accessibilityLabel: string; accessibilityHint?: string };
        expect(`${cpp.accessibilityLabel} ${cpp.accessibilityHint ?? ''}`).toMatch(/download/i);
    });

    it('a blocked agent is disabled, and its reason is on the radio', async () => {
        await render(<AgentChoice inSettings />, mounter({ agentPrograms: programs({ can_download: false, unavailable_code: 'no_release' }) }));
        const cpp = (await screen.findByTestId('agent-choice-gaiacpp')).props as { accessibilityHint?: string; accessibilityState?: { disabled?: boolean } };
        expect(cpp.accessibilityState?.disabled).toBe(true);
        expect(cpp.accessibilityHint).toBeTruthy();
    });

    it('a running download has a progress bar with a value, and the Details disclosure exposes expanded', async () => {
        await render(<AgentChoice inSettings />, mounter({ agentPrograms: programs({}, { state: 'downloading', bytes_done: 50, bytes_total: 100, error: null }) }));
        await screen.findByTestId('agent-download-row');
        const bar = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(bar?.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 50 });
        const compare = touchables().find((t) => t.expanded !== undefined);
        expect(compare?.expanded).toBe(false);
        await fireEvent.press(screen.getByText(compare!.name));
        expect(touchables().find((t) => t.name === compare!.name)?.expanded).toBe(true);
    });
});

const model = (fields: Partial<ProviderModel> = {}): ProviderModel => ({
    id: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B', context_length: null, downloaded: true, labels: [], rank: null, note: null, evidence: null,
    available: true, state: 'loaded', fits: true, size_gb: 5.97, ...fields,
});

const row = (m: ProviderModel, extra: Partial<Parameters<typeof ModelRow>[0]> = {}) =>
    render(
        <ModelRow model={m} label="Gemma 4 E4B" current={false} remote={false} busy={null} onUse={jest.fn()} onDownload={jest.fn()} onRemove={jest.fn()} onNpuRecheck={jest.fn()} {...extra} />,
        mounter(),
    );

describeNative('ModelRow accessibility', () => {
    it('names Use, Download and Remove after the model, at 44 pt', async () => {
        await row(model(), { current: false });
        await row(model({ id: 'x', downloaded: false }));
        await row(model({ id: 'y', custom: true } as Partial<ProviderModel>));
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        for (const t of list.filter((x) => /^model-(use|download|remove)-/.test(x.testID ?? ''))) expect(t.name).toContain('Gemma 4 E4B');
    });

    it('a busy Use announces busy and the other actions are disabled', async () => {
        await row(model({ custom: true } as Partial<ProviderModel>), { busy: 'Gemma-4-E4B-it-GGUF' });
        const list = touchables();
        const use = list.find((t) => t.testID === 'model-use-Gemma-4-E4B-it-GGUF');
        expect(use?.busy).toBe(true);
        expect(list.find((t) => t.testID === 'model-remove-Gemma-4-E4B-it-GGUF')?.disabled).toBe(true);
    });

    it('a downloading model has a named, valued progress bar and no action', async () => {
        await row(model({ downloaded: false, download_progress: { state: 'downloading', percent: 40, message: '' } } as Partial<ProviderModel>));
        const bar = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(String(bar?.props.accessibilityLabel)).toContain('Gemma 4 E4B');
        expect(bar?.props.accessibilityValue).toMatchObject({ now: 40 });
        expect(touchables().some((t) => /^model-(use|download)-/.test(t.testID ?? ''))).toBe(false);
    });

    it('Details exposes expanded and flips it', async () => {
        await row(model());
        const details = () => touchables().find((t) => t.expanded !== undefined);
        expect(details()?.expanded).toBe(false);
        await fireEvent.press(screen.getByText(details()!.name));
        expect(details()?.expanded).toBe(true);
    });
});

const entry = (e: Partial<SetupCatalogEntry>): SetupCatalogEntry => ({
    id: 'm', name: 'M', roles: ['chat'], purpose: '', if_skipped: null, recipe: null, size_gb: 10, full_size_gb: 10,
    partial: false, partial_gb: 0, downloaded: true, in_lemonade: true, recommended: false, planned: true,
    gaia_model: true, selected: true, skipped: false, chat_choice: true, support: 'verified', reads_images: false,
    feature_tier: 'full', source: null, fits: true, need_gb: 12, capacity_gb: 64, fit_reason: null, ...e,
});

const plan: SetupPlan = {
    lemonade: { mode: 'gaia', url: null, reachable: true },
    chat_model: { id: 'chat', user_set: false, size_gb: 10, downloaded: true },
    recommended_model: 'chat', decided_after_server: false, memory_gb: 64, memory_source: null, options: [], models: [],
    download_gb: 0, disk: { path: '/', free_gb: 100, source: 'local' },
    catalog: [
        entry({ id: 'chat', name: 'Chat-GGUF' }),
        entry({ id: 'embed', name: 'Embed-GGUF', roles: ['embedding'], chat_choice: false, size_gb: 2, full_size_gb: 2 }),
        entry({ id: 'big', name: 'Big-GGUF', downloaded: false, fits: false, need_gb: 90, capacity_gb: 64, size_gb: 80, full_size_gb: 80 }),
    ],
};

describeNative('LocalModels accessibility', () => {
    const open = async () => {
        await render(<LocalModels />, mounter({ setupPlan: plan, setupStatus: { state: 'idle' } }));
        await fireEvent.press(screen.getByTestId('local-models-toggle'));
        await screen.findByTestId('local-apply');
    };

    it('the group header exposes expanded, and every control is named and sized', async () => {
        await render(<LocalModels />, mounter({ setupPlan: plan, setupStatus: { state: 'idle' } }));
        expect(touchables().find((t) => t.testID === 'local-models-toggle')?.expanded).toBe(false);
        await fireEvent.press(screen.getByTestId('local-models-toggle'));
        await screen.findByTestId('local-apply');
        expect(touchables().find((t) => t.testID === 'local-models-toggle')?.expanded).toBe(true);
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('each model is a checkbox that exposes checked, and Apply is a named button', async () => {
        await open();
        const boxes = touchables().filter((t) => t.role === 'checkbox');
        expect(boxes.length).toBe(3);
        expect(boxes.find((b) => b.name === 'Chat-GGUF')?.checked).toBe(true);
        const apply = touchables().find((t) => t.testID === 'local-apply');
        expect(apply?.role).toBe('button');
        expect(apply?.name).toBeTruthy();
    });

    it('a model too big for this PC says so on its checkbox, not only in text beside it', async () => {
        await open();
        const big = touchables().find((t) => t.role === 'checkbox' && t.name.startsWith('Big-GGUF'));
        const props = big!.node.props as { accessibilityLabel?: string; accessibilityHint?: string };
        expect(`${props.accessibilityLabel} ${props.accessibilityHint ?? ''}`).toMatch(/memory|fit|too big|GB/i);
    });

    it('Remove is named after its model', async () => {
        await open();
        expect(touchables().find((t) => t.testID === 'local-remove-embed')?.name).toContain('Embed-GGUF');
    });
});
