// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'test-renderer';

import type { ActiveModel, ProviderModel, ProviderSummary, ProviderSummaryList } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';
import { usePickLoadStore } from '@/state/pickLoad';

import Model from './Model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const selects: Record<string, { onChange: (v: string) => void }> = {};
const roots: ReturnType<typeof createRoot>[] = [];

// A pane left mounted keeps refetching after its switch and re-registers its own Switch model select over the next test's.
afterEach(() => {
    act(() => roots.splice(0).forEach((r) => r.unmount()));
    usePickLoadStore.getState().clear();
    for (const label of Object.keys(selects)) delete selects[label];
});

jest.mock('@/ui', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const Pass = ({ children }: { children?: unknown }) => children ?? null;
    return {
        Badge: ({ label }: { label: string }) => <RNText>{label}</RNText>,
        Card: Pass,
        Disclosure: Pass,
        Divider: () => null,
        Ltr: Pass,
        PillTabs: () => null,
        Notice: ({ message, role }: { message?: string; role?: string }) => <RNText role={role}>{message}</RNText>,
        Row: Pass,
        Select: (p: { label: string; onChange: (v: string) => void }) => {
            selects[p.label] = p;
            return null;
        },
        SettingsGroup: Pass,
        Spinner: () => null,
        Stack: Pass,
        Surface: Pass,
        Text: RNText,
    };
});
jest.mock('./model/ModelList', () => ({ ModelList: () => null }));
jest.mock('./model/AgentChoice', () => ({ AgentChoice: () => null }));
jest.mock('./model/ProviderKey', () => ({ ProviderKey: () => null }));
jest.mock('./model/CloudSpending', () => ({ CloudSpending: () => null }));
jest.mock('./model/CloudPrices', () => ({ CloudPrices: () => null }));
jest.mock('../targets', () => ({ SettingsAnchor: ({ children }: { children?: unknown }) => children ?? null }));

const local: ProviderSummary = { id: 'local', name: 'Local', remote: false, privacy_notice: 'Runs on this PC. Nothing leaves your machine.', configured: true, blocked: false };
const model = (id: string, display_name: string): ProviderModel => ({
    id,
    display_name,
    context_length: null,
    downloaded: true,
    labels: [],
    rank: null,
    note: null,
    evidence: null,
    available: true,
});
const providers: ProviderSummaryList = { providers: [local], lemonade_error: null };
const active: ActiveModel = { provider: 'local', model: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B', label: null, remote: false, is_default: true, downloaded: true };

async function render(data: FakeClientData) {
    const client = createFakeClient(data);
    const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
    roots.push(r);
    await act(async () => {
        r.render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <Model />
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
    });
    for (let i = 0; i < 6; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return JSON.stringify(r.container.toJSON());
}

// react-query hands a settled mutation to the screen on a 0 ms timer, which act() doesn't wait for.
async function tick() {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function until(what: string, done: () => boolean) {
    for (let i = 0; i < 50 && !done(); i++) await tick();
    if (!done()) throw new Error(`The Model pane never got to: ${what}`);
}

async function switchTo(failWith?: GaiaApiError) {
    const client = createFakeClient({
        providers,
        activeModel: active,
        providerModels: {
            local: { provider: 'local', models: [model('Gemma-4-E4B-it-GGUF', 'Gemma 4 E4B'), model('Qwen3.6-35B-A3B-GGUF', 'Qwen 3.6 35B')] },
        },
        contexts: {},
        selectError: failWith,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
    roots.push(r);
    await act(async () => {
        r.render(
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <Model />
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
    });
    await until('the Switch model picker, every read answered', () => !!selects['Switch model'] && queryClient.isFetching() === 0);
    await act(async () => selects['Switch model']!.onChange('Qwen3.6-35B-A3B-GGUF'));
    await until('the switch settled', () => queryClient.isMutating() === 0);
    // The outcome's timer was queued as the switch settled, so it runs before this one.
    await tick();
    return { client, shown: JSON.stringify(r.container.toJSON()) };
}

describe('Model pane switch', () => {
    it('posts the picked model once and confirms it', async () => {
        const { client, shown } = await switchTo();
        expect(client.selected).toEqual(['Qwen3.6-35B-A3B-GGUF']);
        expect(shown).toContain('New messages use \u2066Qwen 3.6 35B\u2069. It is remembered across restarts.');
    });

    it("shows the PC's reason when the switch fails", async () => {
        const { shown } = await switchTo(new GaiaApiError(400, 'Model is not downloaded'));
        expect(shown).toContain('Model is not downloaded');
    });
});

describe('Model pane provider notice', () => {
    const cloud = (privacy_notice: string): ProviderSummaryList => ({
        providers: [local, { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice, configured: false, blocked: false }],
        lemonade_error: null,
    });
    const onFireworks = (list: ProviderSummaryList): FakeClientData => ({
        providers: list,
        activeModel: { ...active, provider: 'fireworks', remote: true },
        providerModels: { fireworks: { provider: 'fireworks', models: [] } },
        contexts: {},
    });

    it('shows a remote provider\'s notice, and none when the PC sends it blank', async () => {
        expect(await render(onFireworks(cloud('Chat history is sent to Fireworks AI.')))).toContain('"role":"note"');
        expect(await render(onFireworks(cloud('  ')))).not.toContain('"role":"note"');
    });
});
