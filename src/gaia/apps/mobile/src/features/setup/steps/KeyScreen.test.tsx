// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CloudPriceList } from '@webui/types';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ProviderSummary } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import type { FakeClientData } from '@/api/fake';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import type { SetupStepContext } from '../SetupScreen';
import { KeyScreen } from './KeyScreen';

const provider = (p: Partial<ProviderSummary>): ProviderSummary => ({ id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: '', configured: false, blocked: false, ...p });
const prices: CloudPriceList = {
    provider: 'fireworks', source: 'fireworks.ai/pricing', note: null,
    models: [
        { model: 'fireworks.kimi', name: 'Kimi', rank: 1, note: null, price: { input_per_million: 0.6, output_per_million: 2.5 } as never },
        { model: 'fireworks.glm', name: 'GLM', rank: 2, note: null, price: { input_per_million: 0.6, output_per_million: 2.5 } as never },
    ],
};

async function mount(providers: ProviderSummary[], extra: FakeClientData = {}) {
    const client = createFakeClient({
        providers: { providers, lemonade_error: null },
        cloudPrices: { fireworks: prices },
        providerModels: { fireworks: { provider: 'fireworks', models: [{ id: 'fireworks.kimi', rank: 1 } as never, { id: 'fireworks.glm', rank: 2 } as never] } },
        activeModel: { provider: 'local', model: 'm', remote: false } as never,
        lemonadeTarget: { source: 'gaia', offer: false } as never,
        ...extra,
    });
    const ctx = { locked: false, startedRun: jest.fn() } as unknown as SetupStepContext;
    const close = jest.fn();
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
    await render(<KeyScreen ctx={ctx} close={close} />, { wrapper: wrap });
    return { client, ctx, close };
}

describe('KeyScreen', () => {
    it('without a key on the PC, waits for a typed key, sends it once in the body, clears it and starts the run', async () => {
        const { client, ctx } = await mount([provider({ configured: false })]);
        await screen.findByText('Kimi · Default', { exact: false });
        const field = screen.getByTestId('key-field');
        // A secret field: masked with no reveal, and nothing offered to suggestions, autofill or password managers.
        expect(field.props).toMatchObject({ secureTextEntry: true, autoCorrect: false, spellCheck: false, autoComplete: 'off', textContentType: 'none', importantForAutofill: 'no' });
        expect(screen.queryByLabelText('Show key')).toBeNull();
        expect(screen.getByLabelText('Test and connect')).toBeDisabled();
        expect(client.connects).toEqual([]);

        const connect = jest.spyOn(client, 'connectProvider');
        await fireEvent.changeText(field, 'fw-setup-test-key-77');
        await fireEvent.press(screen.getByLabelText('Test and connect'));
        await waitFor(() => expect(ctx.startedRun).toHaveBeenCalled());
        expect(connect.mock.calls).toEqual([['fireworks', { apiKey: 'fw-setup-test-key-77' }]]);
        expect(screen.getByTestId('key-field').props.value).toBe('');
        expect(client.setupStarts).toMatchObject([{ skipChatModel: true }]);
    });

    it('a typed key the PC refuses from a phone (403) clears, locks the field and says to change it on the PC', async () => {
        const { client, ctx } = await mount([provider({ configured: false })]);
        jest.spyOn(client, 'connectProvider').mockRejectedValue(new GaiaApiError(403, 'Enter provider keys on the PC running GAIA, not over mobile access or from a paired device.'));
        await screen.findByText('Kimi · Default', { exact: false });
        await fireEvent.changeText(screen.getByTestId('key-field'), 'fw-setup-test-key-77');
        await fireEvent.press(screen.getByLabelText('Test and connect'));
        expect(await screen.findByTestId('key-pc-only')).toBeTruthy();
        expect(screen.getByTestId('key-field').props).toMatchObject({ value: '', editable: false });
        expect(screen.queryByText(/fw-setup-test-key-77/)).toBeNull();
        expect(ctx.startedRun).not.toHaveBeenCalled();
    });

    it('with a key on the PC, connects it, selects the model and starts the cloud run, sending no key', async () => {
        const { client, ctx } = await mount([provider({ configured: true })]);
        await screen.findByText('Kimi · Default', { exact: false });
        fireEvent.press(screen.getByLabelText('Test and connect'));
        await waitFor(() => expect(ctx.startedRun).toHaveBeenCalled());
        expect(client.connects).toEqual(['fireworks']);
        expect(client.setupStarts).toMatchObject([{ skipChatModel: true }]);
    });

    it('says an environment key was found, with the variable name left to right, until a key is typed', async () => {
        await mount([provider({ configured: true, key_source: 'environment', key_hint: '9c1e', env_var: 'FIREWORKS_API_KEY' })]);
        const line = await screen.findByTestId('key-env-found');
        expect(line.props.children).toContain('Found a');
        expect(line.props.children).toContain('\u2066FIREWORKS_API_KEY\u2069');
        await fireEvent.changeText(screen.getByTestId('key-field'), 'fw-typed');
        expect(screen.queryByTestId('key-env-found')).toBeNull();
    });

    it('does not say it for a stored key', async () => {
        await mount([provider({ configured: true, key_source: 'stored', key_hint: '4f2a' })]);
        await screen.findByText('Kimi · Default', { exact: false });
        expect(screen.queryByTestId('key-env-found')).toBeNull();
    });

    it('connects an environment key without sending a key', async () => {
        const { client, ctx } = await mount([provider({ configured: true, key_source: 'environment', env_var: 'FIREWORKS_API_KEY' })]);
        await screen.findByTestId('key-env-found');
        const connect = jest.spyOn(client, 'connectProvider');
        fireEvent.press(screen.getByLabelText('Test and connect'));
        await waitFor(() => expect(ctx.startedRun).toHaveBeenCalled());
        expect(connect.mock.calls).toEqual([['fireworks']]);
    });

    it('run again with a cloud model in use keeps that model and connects it, not the top-ranked one', async () => {
        const { client, ctx } = await mount([provider({ configured: true })], {
            activeModel: { provider: 'fireworks', model: 'fireworks.glm', remote: true } as never,
        });
        await screen.findByText('GLM', { exact: false });
        fireEvent.press(screen.getByLabelText('Test and connect'));
        await waitFor(() => expect(ctx.startedRun).toHaveBeenCalled());
        expect(client.selected).toEqual(['fireworks.glm']);
    });

    it('with the AMD gateway unreachable and already chosen, says so and offers to check again', async () => {
        const { client } = await mount([provider({ id: 'amd', name: 'AMD LLM Gateway', network: { reachable: false } })], { activeModel: { provider: 'amd', model: 'm', remote: true } as never });
        await screen.findByText("Unavailable: needs AMD's network or VPN.");
        const reads = jest.spyOn(client, 'listProviderSummaries');
        fireEvent.press(screen.getByLabelText('Check the AMD gateway again'));
        await waitFor(() => expect(reads).toHaveBeenCalled());
    });

    it('keeps the PC\'s reason off the price-load sentence and shows it left to right below', async () => {
        await mount([provider({ configured: true })], { cloudPrices: {} });
        const sentence = await screen.findByText('Prices could not be loaded.');
        expect(sentence.props.children).not.toContain('no prices');
        const detail = screen.getByText(/no prices for fireworks/);
        expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ writingDirection: 'ltr' });
    });
});

