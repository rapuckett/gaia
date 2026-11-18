// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider, type ProviderRow } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { ProviderKey } from './ProviderKey';

// The web project's renderer can't mount react-native-web's DOM or the sheet host.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const DUMMY_KEY = 'sk-test-dummy';
const TYPED_KEY = 'fw-typed-test-key-4242';
const none: ProviderRow = { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: '', configured: false, blocked: false };

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

    it('a key the provider rejects (422) says so by name, not pairing, with the PC\'s reason masked under it', async () => {
        const { client, queryClient, wrap } = setup(none);
        jest.spyOn(client, 'connectProvider').mockRejectedValue(new GaiaApiError(422, `Fireworks AI rejected the key ${TYPED_KEY}. Check it and try again.`));
        const r = await render(<ProviderKey provider={none} connected={false} />, { wrapper: wrap });

        await fireEvent.changeText(screen.getByTestId('provider-key-field'), TYPED_KEY);
        await fireEvent.press(screen.getByTestId('provider-key-connect'));

        expect(await screen.findByText(/didn't accept that key/)).toBeTruthy();
        expect(screen.queryByText(/pair/i)).toBeNull();
        expect(screen.getByText(/rejected the key ••••\./)).toBeTruthy();
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
});
