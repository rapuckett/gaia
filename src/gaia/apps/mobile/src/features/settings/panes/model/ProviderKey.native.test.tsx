// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider, useProviders, type ProviderRow } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { ProviderKey } from './ProviderKey';

// The web project's renderer can't mount react-native-web's DOM or the sheet host.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const DUMMY_KEY = 'sk-test-dummy';
const TYPED_KEY = 'fw-typed-test-key-4242';
const none: ProviderRow = { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: '', configured: false, blocked: false };
const stored: ProviderRow = { ...none, configured: true, key_source: 'stored', key_state: 'read', key_hint: '4f2a', known_models: false };

/** The card as the Model pane mounts it: the row comes from the PC's provider list. */
function FromList() {
    const row = useProviders().data?.providers.find((p) => p.id === 'fireworks');
    return row ? <ProviderKey provider={row} connected={row.configured} /> : null;
}

/** Everything the app could still hold the key in: the screen, the query cache and the mutation cache. */
function heldAnywhere(r: { toJSON: () => unknown }, queryClient: QueryClient): string {
    return JSON.stringify([
        r.toJSON(),
        queryClient.getQueryCache().getAll().map((q) => q.state),
        queryClient.getMutationCache().getAll().map((m) => m.state),
    ]);
}

function setup(provider: ProviderRow) {
    const client = createFakeClient({ providers: { providers: [provider], lemonade_error: null } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
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
    return { client, queryClient, wrap };
}

describeNative('Provider key', () => {
    afterEach(() => act(() => sheetStore.reset()));

    it('a typed key goes to the PC once, then is gone from the field, the screen and every cache', async () => {
        const { client, queryClient, wrap } = setup(none);
        const r = await render(<ProviderKey provider={none} connected={false} />, { wrapper: wrap });

        const field = screen.getByTestId('provider-key-field');
        // A secret field: masked with no reveal, and nothing offered to suggestions, autofill or password managers.
        expect(field.props).toMatchObject({ secureTextEntry: true, autoCorrect: false, spellCheck: false, autoComplete: 'off', textContentType: 'none', importantForAutofill: 'no', autoCapitalize: 'none' });
        expect(screen.queryByLabelText('Show key')).toBeNull();
        expect(screen.getByTestId('provider-key-connect')).toBeDisabled();
        expect(screen.queryByText(/Gateway URL|Auth header/)).toBeNull();

        await fireEvent.changeText(field, TYPED_KEY);
        expect(screen.getByTestId('provider-key-connect')).toBeEnabled();
        await fireEvent.press(screen.getByTestId('provider-key-connect'));
        await screen.findByText('Connected. The key is kept for next time.');

        expect(client.keyedConnects).toEqual(['fireworks']);
        expect(screen.getByTestId('provider-key-field').props.value).toBe('');
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TYPED_KEY);
        queryClient.clear();
    });

    it('a key the PC refuses from a phone (403) clears and gives way to "Change this on the PC"', async () => {
        const { client, queryClient, wrap } = setup(none);
        jest.spyOn(client, 'connectProvider').mockRejectedValue(new GaiaApiError(403, 'Enter provider keys on the PC running GAIA, not over mobile access or from a paired device.'));
        const r = await render(<ProviderKey provider={none} connected={false} />, { wrapper: wrap });

        await fireEvent.changeText(screen.getByTestId('provider-key-field'), TYPED_KEY);
        await fireEvent.press(screen.getByTestId('provider-key-connect'));

        expect(await screen.findByTestId('provider-key-pc-only')).toHaveTextContent('Change this on the PC running GAIA.');
        expect(screen.queryByTestId('provider-key-field')).toBeNull();
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TYPED_KEY);
        queryClient.clear();
    });

    it('a PC error that echoes the key shows it masked on the detail line, and the field clears', async () => {
        const { client, queryClient, wrap } = setup(none);
        jest.spyOn(client, 'connectProvider').mockRejectedValue(new GaiaApiError(502, `Fireworks AI rejected the key ${TYPED_KEY}: 401 Unauthorized.`));
        const r = await render(<ProviderKey provider={none} connected={false} />, { wrapper: wrap });

        await fireEvent.changeText(screen.getByTestId('provider-key-field'), `  ${TYPED_KEY} `);
        await fireEvent.press(screen.getByTestId('provider-key-connect'));

        expect(await screen.findByText(/rejected the key ••••: 401 Unauthorized/)).toBeTruthy();
        expect(screen.getByTestId('provider-key-field').props.value).toBe('');
        expect(client.connectProvider).toHaveBeenCalledWith('fireworks', { apiKey: TYPED_KEY });
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TYPED_KEY);
        queryClient.clear();
    });

    it('Replace opens the same field as "Paste your new key" with Save key, and Cancel closes it', async () => {
        const connected: ProviderRow = { ...none, configured: true };
        const { client, queryClient, wrap } = setup(connected);
        await render(<ProviderKey provider={connected} connected />, { wrapper: wrap });

        expect(screen.queryByTestId('provider-key-field')).toBeNull();
        await fireEvent.press(screen.getByTestId('provider-key-replace'));
        const field = screen.getByTestId('provider-key-field');
        expect(field.props).toMatchObject({ placeholder: 'Paste your new key', secureTextEntry: true });
        expect(screen.getByTestId('provider-key-connect')).toHaveTextContent('Save key');

        await fireEvent.changeText(field, TYPED_KEY);
        await fireEvent.press(screen.getByTestId('provider-key-cancel'));
        expect(screen.queryByTestId('provider-key-field')).toBeNull();
        expect(client.connects).toEqual([]);
        queryClient.clear();
    });

    it('a locked OS key store (423) shows the PC\'s sentence under ours, and Try again asks the PC once more', async () => {
        const { client, queryClient, wrap } = setup(none);
        const locked = 'The credential store on the PC running GAIA could not be used. Unlock or fix it on the PC, then try again.';
        jest.spyOn(client, 'connectProvider').mockRejectedValue(new GaiaApiError(423, locked));
        await render(<ProviderKey provider={none} connected={false} />, { wrapper: wrap });

        await fireEvent.press(screen.getByTestId('provider-key-reconnect'));
        expect(await screen.findByText("The OS key store is locked, so GAIA can't read your saved key.")).toBeTruthy();
        expect(screen.getByText(locked)).toBeTruthy();
        await fireEvent.press(screen.getByText('Try again'));
        await waitFor(() => expect(client.keyStoreRetries).toBe(1));
        expect(screen.queryByTestId('provider-key-locked')).toBeNull();
        queryClient.clear();
    });

    it('Remove key asks first, then clears the saved key on the PC', async () => {
        const connected: ProviderRow = { ...none, configured: true };
        const { client, queryClient, wrap } = setup(connected);
        await render(<ProviderKey provider={connected} connected />, { wrapper: wrap });

        await fireEvent.press(screen.getByTestId('provider-key-remove'));
        expect(await screen.findByText('Remove this key?')).toBeTruthy();
        expect(client.keyRemovals).toEqual([]);
        await fireEvent.press(screen.getByTestId('confirm-ok'));
        expect(await screen.findByText(/^Key cleared, here and for future sessions/)).toBeTruthy();
        expect(client.keyRemovals).toEqual(['fireworks']);
        queryClient.clear();
    });

    it('Reconnect works without any key leaving the phone', async () => {
        const saved: ProviderRow = { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: '', configured: false, blocked: false };
        const { client, queryClient, wrap } = setup(saved);
        const r = await render(<ProviderKey provider={saved} connected={false} />, { wrapper: wrap });

        expect(screen.queryByText(/^(Replace|Remove key)$/)).toBeNull();

        await fireEvent.press(screen.getByText('Reconnect'));
        await screen.findByText('Connected. The key is kept for next time.');
        expect(client.connects).toEqual(['fireworks']);
        expect(client.keyedConnects).toEqual([]);
        expect(JSON.stringify(r.container.toJSON())).not.toContain(DUMMY_KEY);
        queryClient.clear();
    });
    it('shows a saved key as 20 bullets and the PC\'s last four, labeled as the saved key', async () => {
        const { queryClient, wrap } = setup(stored);
        await render(<ProviderKey provider={stored} connected />, { wrapper: wrap });

        const saved = screen.getByTestId('provider-key-saved');
        // LTR-isolated, so the last four stay at the end in Arabic too.
        expect(saved).toHaveTextContent(`\u2066${'•'.repeat(20)} 4f2a\u2069`);
        expect(saved.props.accessibilityLabel).toMatch(/^Saved .*Fireworks AI.* API key$/);
        queryClient.clear();
    });

    it('shows no saved-key row when the PC sends no hint, as over mobile access', async () => {
        const noHint: ProviderRow = { ...stored, key_hint: null };
        const { queryClient, wrap } = setup(noHint);
        await render(<ProviderKey provider={noHint} connected />, { wrapper: wrap });

        expect(screen.queryByTestId('provider-key-saved')).toBeNull();
        expect(screen.queryByText(/•/)).toBeNull();
        expect(screen.getByTestId('provider-key-remove')).toBeTruthy();
        queryClient.clear();
    });

    it('a key from the PC\'s environment can\'t be removed or replaced from here', async () => {
        const env: ProviderRow = { ...stored, key_source: 'environment', key_hint: '9c1e' };
        const { queryClient, wrap } = setup(env);
        await render(<ProviderKey provider={env} connected />, { wrapper: wrap });

        expect(screen.getByTestId('provider-key-env')).toHaveTextContent('From your environment on your PC');
        expect(screen.queryByTestId('provider-key-remove')).toBeNull();
        expect(screen.queryByTestId('provider-key-replace')).toBeNull();
        queryClient.clear();
    });

    it('before GAIA on the PC has read its key store, it says it is waiting for the OS', async () => {
        const unknown: ProviderRow = { ...none, key_source: null, key_state: 'unknown', key_hint: null, known_models: false };
        const { queryClient, wrap } = setup(unknown);
        await render(<ProviderKey provider={unknown} connected={false} />, { wrapper: wrap });

        expect(screen.getByTestId('provider-key-waiting')).toHaveTextContent('Waiting for the OS to allow reading the saved key.');
        expect(screen.queryByText('No key yet.')).toBeNull();
        expect(screen.getByTestId('provider-key-reconnect')).toBeTruthy();
        queryClient.clear();
    });

    it('says the model list may be out of date only while the PC serves the models it knows', async () => {
        const stale: ProviderRow = { ...stored, known_models: true };
        const { queryClient, wrap } = setup(stale);
        const r = await render(<ProviderKey provider={stored} connected />, { wrapper: wrap });
        expect(screen.queryByTestId('provider-key-known-list')).toBeNull();

        await r.rerender(<ProviderKey provider={stale} connected />);
        expect(screen.getByTestId('provider-key-known-list')).toHaveTextContent(/can't list its models right now, so GAIA is showing models it already knows/);
        queryClient.clear();
    });

    it('after a new key is saved, the card reads the PC\'s list again and shows the new hint', async () => {
        const { client, queryClient, wrap } = setup(stored);
        let hint = '4f2a';
        jest.spyOn(client, 'listProviderSummaries').mockImplementation(async () => ({ providers: [{ ...stored, key_hint: hint }], lemonade_error: null }));
        jest.spyOn(client, 'connectProvider').mockImplementation(async () => {
            hint = '4242';
            return { remembered: true };
        });
        const r = await render(<FromList />, { wrapper: wrap });

        expect(await screen.findByTestId('provider-key-saved')).toHaveTextContent(/4f2a/);
        await fireEvent.press(screen.getByTestId('provider-key-replace'));
        await fireEvent.changeText(screen.getByTestId('provider-key-field'), TYPED_KEY);
        await fireEvent.press(screen.getByTestId('provider-key-connect'));

        await waitFor(() => expect(screen.getByTestId('provider-key-saved')).toHaveTextContent(/4242/));
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TYPED_KEY);
        queryClient.clear();
    });
});
