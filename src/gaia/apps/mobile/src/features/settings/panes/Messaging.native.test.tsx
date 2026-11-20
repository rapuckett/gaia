// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DiscordStatus } from '@/api/client.types';
import { PC_ONLY_REFUSAL } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { useDeviceRefused } from '@/api/routeAccess';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import Messaging from './Messaging';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/api/routeAccess', () => ({ ...jest.requireActual('@/api/routeAccess'), useDeviceRefused: jest.fn(() => false) }));

// The web project's renderer can't mount react-native-web's DOM or the sheet host.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const PAIRING: DiscordStatus = {
    connected: true,
    paired: false,
    running: true,
    state: 'pairing',
    detail: '',
    bot_name: 'GAIA test bot',
    owner_name: '',
    autostart: true,
    always_allowed: [],
    model: null,
    portal_url: 'https://example.invalid/portal',
    bot_page_url: 'https://example.invalid/bot',
    invite_url: 'https://example.invalid/invite',
    bot_profile_url: 'https://example.invalid/profile',
    pairing_code: 'DUMY2345',
    pairing_expires_at: 0,
    discord_installed: false,
    should_offer_setup: false,
};

async function renderPane(discordStatus: FakeClientData['discordStatus']) {
    const client = createFakeClient({ discordStatus });
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
    await render(<Messaging />, { wrapper: wrap });
    return queryClient;
}

function setup(data: FakeClientData) {
    const client = createFakeClient(data);
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

const TOKEN = 'test-bot-token-not-real-4242';
const NO_BOT: DiscordStatus = { ...PAIRING, connected: false, running: false, state: 'stopped', bot_name: '', pairing_code: '' };
const PAIRED: DiscordStatus = { ...PAIRING, state: 'connected', paired: true, owner_name: 'Alex', pairing_code: '' };

/** Everything the app could still hold the token in: the screen, the query cache and the mutation cache. */
function heldAnywhere(r: { toJSON: () => unknown }, queryClient: QueryClient): string {
    return JSON.stringify([
        r.toJSON(),
        queryClient.getQueryCache().getAll().map((q) => q.state),
        queryClient.getMutationCache().getAll().map((m) => m.state),
    ]);
}

// Any input that could take the bot token: none may render, whatever the PC answers.
const secretFields = () => screen.container.queryAll((node) => node.props.secureTextEntry === true || node.type === 'TextInput');

describeNative('Messaging pane', () => {
    afterEach(async () => {
        jest.mocked(useDeviceRefused).mockImplementation(() => false);
        await act(() => sheetStore.reset());
    });

    it("the PC's 403 shows the PC-only notice and never a token field", async () => {
        const queryClient = await renderPane(new GaiaApiError(403, PC_ONLY_REFUSAL));
        await screen.findByTestId('messaging-pc-only');
        expect(screen.getByText('Change this on the PC running GAIA.')).toBeTruthy();
        expect(secretFields()).toHaveLength(0);
        expect(screen.queryByPlaceholderText('Paste the bot token')).toBeNull();
        fireEvent.press(screen.getByTestId('messaging-connect'));
        expect(await screen.findByTestId('messaging-connect-refusal')).toBeTruthy();
        expect(secretFields()).toHaveLength(0);
        queryClient.clear();
    });

    it('a pairing code the PC sends shows, and Copy puts the raw code on the clipboard', async () => {
        const queryClient = await renderPane(PAIRING);
        await screen.findByText('DUMY-2345', { exact: false });
        fireEvent.press(screen.getByTestId('messaging-copy-code'));
        await screen.findByText('Copied');
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith('DUMY2345');
        expect(secretFields()).toHaveLength(0);
        queryClient.clear();
    });

    it('a typed token goes to the PC once in the body, then is gone from the field, the screen and every cache', async () => {
        const { client, queryClient, wrap } = setup({ discordStatus: NO_BOT, discordPairingCode: 'DUMY2345' });
        const connect = jest.spyOn(client, 'connectDiscord');
        const r = await render(<Messaging />, { wrapper: wrap });

        const field = await screen.findByTestId('messaging-token');
        // A secret field: masked with no reveal, and nothing offered to suggestions, autofill or password managers.
        expect(field.props).toMatchObject({ secureTextEntry: true, autoCorrect: false, spellCheck: false, autoComplete: 'off', textContentType: 'none', importantForAutofill: 'no', placeholder: 'Paste the bot token', accessibilityLabel: 'Bot token' });
        expect(screen.getByTestId('messaging-connect')).toBeDisabled();

        await fireEvent.changeText(field, `  ${TOKEN} `);
        await fireEvent.press(screen.getByTestId('messaging-connect'));
        await screen.findByText('Your bot is connected. Two more steps:');

        expect(connect).toHaveBeenCalledWith(TOKEN);
        expect(client.discordActions).toEqual(['connect']);
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TOKEN);
        queryClient.clear();
    });

    it('a PC error that echoes the token shows it masked on the detail line, and the field clears', async () => {
        const { client, queryClient, wrap } = setup({ discordStatus: NO_BOT });
        jest.spyOn(client, 'connectDiscord').mockRejectedValue(new GaiaApiError(400, `Discord did not accept the token ${TOKEN}: 401 Unauthorized.`));
        const r = await render(<Messaging />, { wrapper: wrap });

        await fireEvent.changeText(await screen.findByTestId('messaging-token'), TOKEN);
        await fireEvent.press(screen.getByTestId('messaging-connect'));

        expect(await screen.findByText(/did not accept the token ••••: 401 Unauthorized/)).toBeTruthy();
        expect(screen.getByTestId('messaging-token').props.value).toBe('');
        expect(heldAnywhere(r.container, queryClient)).not.toContain(TOKEN);
        queryClient.clear();
    });

    it.each([
        [false, ['stop']],
        [true, []],
    ])('route refused %s: Stop works, or keeps the PC-only pattern and never calls the PC', async (refused, actions) => {
        // The status read stays allowed; only the buttons' routes are refused.
        jest.mocked(useDeviceRefused).mockImplementation((method) => refused && method === 'POST');
        const { client, queryClient, wrap } = setup({ discordStatus: PAIRED });
        await render(<Messaging />, { wrapper: wrap });

        await fireEvent.press(await screen.findByTestId('messaging-stop'));
        if (refused) {
            expect(await screen.findByTestId('messaging-stop-refusal')).toBeTruthy();
            expect(screen.getByTestId('messaging-pc-only')).toBeTruthy();
        } else {
            expect(await screen.findByText(/GAIA isn.t answering on Discord right now/)).toBeTruthy();
            expect(screen.queryByTestId('messaging-pc-only')).toBeNull();
        }
        expect(client.discordActions).toEqual(actions);
        queryClient.clear();
    });

    it('a 403 on a button turns the buttons into the PC-only pattern', async () => {
        const { client, queryClient, wrap } = setup({ discordStatus: PAIRED });
        jest.spyOn(client, 'restartDiscord').mockRejectedValue(new GaiaApiError(403, PC_ONLY_REFUSAL));
        await render(<Messaging />, { wrapper: wrap });

        await fireEvent.press(await screen.findByTestId('messaging-restart'));
        expect(await screen.findByTestId('messaging-pc-only')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('messaging-restart'));
        expect(await screen.findByTestId('messaging-restart-refusal')).toBeTruthy();
        expect(screen.queryByTestId('messaging-action-failed')).toBeNull();
        queryClient.clear();
    });

    it.each([
        ['DUMY2345', /DUMY-2345/],
        [undefined, null],
    ])('Show a pairing code shows the code only when the PC sends one (%s)', async (code, shown) => {
        const { client, queryClient, wrap } = setup({ discordStatus: { ...PAIRING, state: 'connected', pairing_code: '' }, discordPairingCode: code });
        await render(<Messaging />, { wrapper: wrap });

        expect(screen.queryByTestId('messaging-pairing-code')).toBeNull();
        await fireEvent.press(await screen.findByTestId('messaging-show-code'));
        expect(client.discordActions).toEqual(['pair']);
        if (shown) {
            expect(await screen.findByTestId('messaging-pairing-code')).toHaveTextContent(shown);
        } else {
            expect(await screen.findByText('Waiting for a code…')).toBeTruthy();
            expect(screen.queryByTestId('messaging-pairing-code')).toBeNull();
        }
        queryClient.clear();
    });

    it('Disconnect asks first: Cancel keeps the bot, Disconnect forgets it', async () => {
        const { client, queryClient, wrap } = setup({ discordStatus: PAIRED });
        await render(<Messaging />, { wrapper: wrap });

        await fireEvent.press(await screen.findByTestId('messaging-disconnect'));
        expect(await screen.findByText('Disconnect Discord?')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('confirm-cancel'));
        expect(client.discordActions).toEqual([]);

        // The card is hidden from the reader until the sheet has gone.
        await fireEvent.press(await screen.findByTestId('messaging-disconnect'));
        await fireEvent.press(await screen.findByTestId('confirm-ok'));
        await screen.findByTestId('messaging-token');
        expect(client.discordActions).toEqual(['disconnect']);
        queryClient.clear();
    });
});
