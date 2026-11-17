// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot } from 'test-renderer';

import { translator } from '@webui/i18n/translator';

import type { ActiveModel, ProviderModel, ProviderSummary } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';

import { GaiaApiError } from '@/api/errors';
import { translator as appTranslator } from '@/i18n/useT';

import { ModelMenu, switchAfterFailed } from './ModelMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/features/settings/openSettings', () => ({ openSettings: jest.fn() }));
jest.mock('@/ui/icons', () => ({ Check: 'Check', Download: 'Download', Info: 'Info', KeyRound: 'KeyRound' }));
jest.mock('@/ui', () => {
    const { createElement: mockElement } = jest.requireActual('react');
    const host = (type: string) => (props: Record<string, unknown>) => mockElement(type, props, props.children as ReactNode);
    return {
        Button: host('Button'),
        Divider: () => null,
        Icon: host('Icon'),
        IconButton: host('IconButton'),
        ListRow: host('ListRow'),
        Ltr: host('Ltr'),
        Notice: host('Notice'),
        Row: host('Row'),
        Sheet: (p: { open: boolean; children?: ReactNode }) => (p.open ? mockElement('Sheet', null, p.children) : null),
        Spinner: () => null,
        Stack: host('Stack'),
        StatusDot: () => null,
        Text: host('Text'),
    };
});

const en = translator('en');
const CLOUD = 'accounts/fireworks/models/kimi-k2';
const local: ProviderSummary = { id: 'local', name: 'Local', remote: false, privacy_notice: en('providers.local.notice'), configured: true, blocked: false };
const fireworks = (blocked: boolean): ProviderSummary => ({
    id: 'fireworks',
    name: 'Fireworks AI',
    remote: true,
    privacy_notice: en('providers.fireworks.notice'),
    configured: true,
    blocked,
});
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
const active: ActiveModel = { provider: 'local', model: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B', label: null, remote: false, is_default: true, downloaded: true };

type Root = ReturnType<typeof createRoot>;
const byId = (r: Root, testID: string) => r.container.queryAll((i) => i.props.testID === testID)[0];
const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

async function openMenu(localOnly: boolean) {
    const client = createFakeClient({
        providers: { providers: [local, fireworks(localOnly)], lemonade_error: null },
        activeModel: active,
        providerModels: {
            local: { provider: 'local', models: [model('Gemma-4-E4B-it-GGUF', 'Gemma 4 E4B')] },
            // Listed even under Local only, so the test shows the menu itself holds them off.
            fireworks: { provider: 'fireworks', models: [model(CLOUD, 'Kimi K2')] },
        },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
    await act(async () => {
        r.render(
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <ModelMenu open onClose={() => undefined} turnRunning={false} queued={null} onQueue={() => undefined} switchError={null} onSwitchError={() => undefined} />
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
    });
    await flush();
    const done = async () => {
        await act(async () => r.unmount());
        queryClient.clear();
    };
    return { client, r, done };
}

describe('model menu cloud consent', () => {
    it("shows the provider's notice before a local chat moves to a cloud model, and cancelling switches nothing", async () => {
        const { client, r, done } = await openMenu(false);
        await act(async () => byId(r, `model-row-${CLOUD}`).props.onPress());
        const consent = byId(r, `model-consent-${CLOUD}`);
        expect(consent.props.message).toBe(en('providers.fireworks.notice'));
        expect(consent.props.action.label).toBe(en('modelMenu.useModel', { name: 'Kimi K2' }));
        expect(client.selected).toEqual([]);

        await act(async () => consent.props.onDismiss());
        await flush();
        expect(byId(r, `model-consent-${CLOUD}`)).toBeUndefined();
        expect(client.selected).toEqual([]);

        await act(async () => byId(r, `model-row-${CLOUD}`).props.onPress());
        await act(async () => byId(r, `model-consent-${CLOUD}`).props.action.onPress());
        await flush();
        expect(client.selected).toEqual([CLOUD]);
        await done();
    });

    it('offers no cloud model under Local only and says why', async () => {
        const { client, r, done } = await openMenu(true);
        expect(byId(r, 'model-blocked-fireworks').props.children).toBe(en('settings.privacy.localOnlyBlocked'));
        expect(byId(r, `model-row-${CLOUD}`)).toBeUndefined();
        expect(client.selected).toEqual([]);
        await done();
    });
});

describe('switchAfterFailed', () => {
    it("keeps the PC's reason off the sentence and hands it over as the detail line", () => {
        const failed = switchAfterFailed('Qwen3-4B-GGUF', new GaiaApiError(500, 'out of memory'), appTranslator('en'));
        expect(failed.message).not.toContain('out of memory');
        expect(failed.message).toContain('Qwen3-4B-GGUF');
        expect(failed.detail).toBe('500 out of memory');
    });
});
