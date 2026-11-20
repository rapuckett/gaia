// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorRow } from '@/api/client.types';
import { BROWSER_SIGN_IN_HANDOFF_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useConnectionStore } from '@/state/connection';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import type { LoopbackOutcome } from '../../../modules/gaia-oauth-loopback';

import { BrowserSignInDepsContext, queryParam, urlHost, type BrowserSignInDeps } from './browserSignIn';
import { isOAuthDoneLink } from './browserSignInDeps';
import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const RETURN_URL = 'ai.amd.gaia.mobile.dev://oauth-done';
// The PC hands a phone this in place of the provider's own reason (routers/connectors.py DEVICE_CONNECTOR_ERROR).
const GENERIC_PC_FAILURE = "GAIA couldn't finish this on the PC. Open Settings › Connectors on the PC to see why.";
const PORT = 50123;

const google = {
    id: 'google',
    display_name: 'Google',
    type: 'oauth_pkce',
    description: 'Gmail and Calendar.',
    configured: false,
    configurable: true,
    account_id: null,
    activations: {},
    available_scopes: ['gmail.readonly', 'calendar.readonly'],
    oauth_setup_fields: [{ key: 'client_id', label: 'OAuth Client ID', kind: 'text', required: true, placeholder: '', help_md: '' }],
    oauth_client: { source: 'keyring', client_id: 'example.apps.googleusercontent.com', has_secret: true },
} as unknown as ConnectorRow;

const PC_STATE = 'pc-state-0123456789abcdefghijklmnopqrstuvwx';

/** A listener the test answers: `redirect` resolves its wait, or it waits until `deliver` or a cancel. */
function fakeDeps(redirect: (state: string) => LoopbackOutcome | null, browserResult?: { type: string }) {
    let release: ((outcome: LoopbackOutcome) => void) | null = null;
    const loopback = {
        start: jest.fn(async () => ({ port: PORT })),
        waitForRedirect: jest.fn((state: string) => {
            const outcome = redirect(state);
            return outcome ? Promise.resolve(outcome) : new Promise<LoopbackOutcome>((resolve) => (release = resolve));
        }),
        cancel: jest.fn(() => release?.({ outcome: 'cancelled' })),
    };
    const deps: BrowserSignInDeps = {
        loopback,
        returnUrl: () => RETURN_URL,
        openAuthSession: jest.fn(() => (browserResult ? Promise.resolve(browserResult) : new Promise<{ type: string }>(() => undefined))),
        dismissAuthSession: jest.fn(),
    };
    return { deps, loopback, deliver: (outcome: LoopbackOutcome) => release?.(outcome) };
}

function setup(data: Omit<FakeClientData, 'connectors'>, deps: BrowserSignInDeps, pinned = true) {
    useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', ...(pinned ? { pinned: true } : {}) } });
    const client = createFakeClient({ connectors: [google], ...data });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <BrowserSignInDepsContext.Provider value={deps}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </BrowserSignInDepsContext.Provider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, queryClient, wrap };
}

async function pressConnect() {
    fireEvent.press(await screen.findByLabelText('Google'));
    fireEvent.press(await screen.findByTestId('connector-connect-google'));
}

describeNative('Connect Google from a paired phone', () => {
    afterEach(() => useConnectionStore.setState({ connection: null }));

    it('sends the listener port, opens the PC link, then hands the code and state back to the PC', async () => {
        const { deps, loopback } = fakeDeps((state) => ({ outcome: 'code', code: '4/0Ab-code', state }));
        const { client, queryClient, wrap } = setup({ browserSignInState: PC_STATE }, deps);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        expect(await screen.findByText(/avery@example.com/)).toBeTruthy();
        expect(loopback.start).toHaveBeenCalledWith(RETURN_URL);
        expect(client.browserSignIns).toEqual([{ connectorId: 'google', redirectPort: PORT, scopes: ['gmail.readonly', 'calendar.readonly'] }]);
        const url = (deps.openAuthSession as jest.Mock).mock.calls[0][0] as string;
        expect(queryParam(url, 'redirect_uri')).toBe(`http://127.0.0.1:${PORT}/callback`);
        expect((deps.openAuthSession as jest.Mock).mock.calls[0][1]).toBe(RETURN_URL);
        expect(loopback.waitForRedirect).toHaveBeenCalledWith(PC_STATE, 15 * 60_000);
        expect(client.browserCompletions).toEqual([{ flowId: 'flow-1', code: '4/0Ab-code', state: PC_STATE }]);
        expect(client.flowCancels).toEqual([]);
        queryClient.clear();
    });

    it.each([
        ['declined at Google', { outcome: 'error', error: 'access_denied' }, {}, /You didn't allow GAIA at Google/, undefined, true],
        ['the 15 minutes ran out', { outcome: 'timeout' }, {}, /within 15 minutes/, undefined, true],
        ['the phone took the port away', { outcome: 'lost' }, {}, /stopped listening for the sign-in/, undefined, true],
        ['the browser ended the listener without a sign-in', { outcome: 'cancelled' }, {}, /Sign-in was cancelled/, undefined, true],
        ['the PC no longer has the flow (404)', 'code', { browserCompleteError: new GaiaApiError(404, 'No sign-in is waiting.') }, /no longer has this sign-in/, 'No sign-in is waiting.', false],
        ['the PC ended it on a state mismatch (400)', 'code', { browserCompleteError: new GaiaApiError(400, 'The state did not match.') }, /didn't match the one it started/, 'The state did not match.', false],
        [
            "Google rejected the code (the PC's generic 500)",
            'code',
            { browserCompleteError: new GaiaApiError(500, GENERIC_PC_FAILURE) },
            /Your PC couldn't finish the sign-in\./,
            GENERIC_PC_FAILURE,
            false,
        ],
        ['the PC refused this phone (403)', 'code', { browserSignInError: new GaiaApiError(403, 'Allow this device first.') }, /didn't let this phone connect Google/, 'Allow this device first.', false],
    ] as const)('says so when %s', async (_name, redirect, data, message, detail, dropsFlow) => {
        const { deps, loopback } = fakeDeps((state) => (redirect === 'code' ? { outcome: 'code', code: 'c', state } : (redirect as LoopbackOutcome)));
        const { client, queryClient, wrap } = setup(data, deps);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        expect(await screen.findByText(message)).toBeTruthy();
        if (detail) expect(screen.getByText(detail)).toBeTruthy();
        expect(loopback.cancel).toHaveBeenCalled();
        await waitFor(() => expect(client.flowCancels).toEqual(dropsFlow ? ['flow-1'] : []));
        expect(screen.getByTestId('connector-connect-google')).toBeTruthy();
        queryClient.clear();
    });

    it("keeps waiting for the listener when another app opens the app's link", async () => {
        const { deps, deliver } = fakeDeps(() => null, { type: 'success' });
        const { client, queryClient, wrap } = setup({ browserSignInState: PC_STATE }, deps);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        await new Promise((resolve) => setTimeout(resolve, 3_500));
        expect(screen.getByText('Finish signing in to Google in the browser.')).toBeTruthy();
        expect(client.flowCancels).toEqual([]);
        deliver({ outcome: 'code', code: 'real-code', state: PC_STATE });
        expect(await screen.findByText(/avery@example.com/)).toBeTruthy();
        expect(client.browserCompletions).toEqual([{ flowId: 'flow-1', code: 'real-code', state: PC_STATE }]);
        queryClient.clear();
    }, 10_000);

    it.each([
        ['a sign-in page that is not Google', (url: string) => url.replace('accounts.google.com', 'accounts.example.com')],
        ['a short state', (url: string) => url.replace(/state=[^&]+/, 'state=short')],
    ])('refuses %s, and drops it on the PC', async (_name, change) => {
        const { deps } = fakeDeps(() => null);
        const { client, queryClient, wrap } = setup({}, deps);
        const start = client.startConnectorBrowserSignIn.bind(client);
        client.startConnectorBrowserSignIn = async (...args) => {
            const flow = await start(...args);
            return { ...flow, authorization_url: change(flow.authorization_url) };
        };
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        expect(await screen.findByText(/started a sign-in this phone can't finish/)).toBeTruthy();
        expect(deps.openAuthSession).not.toHaveBeenCalled();
        await waitFor(() => expect(client.flowCancels).toEqual(['flow-1']));
        queryClient.clear();
    });

    it('stops when the PC reports a sign-in started elsewhere replaced this one', async () => {
        const { deps, loopback } = fakeDeps(() => null);
        const { client, queryClient, wrap } = setup({ browserSuperseded: true }, deps);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        expect(await screen.findByText(/A sign-in started elsewhere replaced this one/)).toBeTruthy();
        expect(loopback.cancel).toHaveBeenCalled();
        expect(deps.dismissAuthSession).toHaveBeenCalled();
        expect(client.browserCompletions).toEqual([]);
        // The PC already dropped the replaced flow.
        expect(client.flowCancels).toEqual([]);
        queryClient.clear();
    });

    it('refuses a link the phone would never hear back from, and drops it on the PC', async () => {
        const { deps } = fakeDeps(() => null);
        const { client, queryClient, wrap } = setup({}, deps);
        const start = client.startConnectorBrowserSignIn.bind(client);
        client.startConnectorBrowserSignIn = async (...args) => {
            const flow = await start(...args);
            return { ...flow, authorization_url: flow.authorization_url.replace(String(PORT), '61000') };
        };
        await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();

        expect(await screen.findByText(/started a sign-in this phone can't finish/)).toBeTruthy();
        expect(deps.openAuthSession).not.toHaveBeenCalled();
        await waitFor(() => expect(client.flowCancels).toEqual(['flow-1']));
        queryClient.clear();
    });

    it('Cancel and closing the screen end the listener and the PC flow', async () => {
        const { deps, loopback } = fakeDeps(() => null);
        const { client, queryClient, wrap } = setup({}, deps);
        const view = await render(<ConnectorsScreen />, { wrapper: wrap });
        await pressConnect();
        expect(await screen.findByText('Finish signing in to Google in the browser.')).toBeTruthy();

        fireEvent.press(screen.getByTestId('browser-sign-in-cancel'));
        await waitFor(() => expect(client.flowCancels).toEqual(['flow-1']));
        expect(loopback.cancel).toHaveBeenCalledTimes(1);
        expect(client.browserCompletions).toEqual([]);

        fireEvent.press(await screen.findByTestId('connector-connect-google'));
        expect(await screen.findByText('Finish signing in to Google in the browser.')).toBeTruthy();
        await view.unmount();
        // A moment later: a Connect that remounts in that time keeps the sign-in.
        await waitFor(() => expect(client.flowCancels).toEqual(['flow-1', 'flow-2']), { timeout: BROWSER_SIGN_IN_HANDOFF_MS + 1_000 });
        expect(loopback.cancel).toHaveBeenCalledTimes(2);
        queryClient.clear();
    });

    it('keeps the PC-only note where the phone is not paired', async () => {
        const { deps } = fakeDeps(() => null);
        const { queryClient, wrap } = setup({}, deps, false);
        await render(<ConnectorsScreen />, { wrapper: wrap });
        fireEvent.press(await screen.findByLabelText('Google'));
        expect(await screen.findByText(/This phone can't connect Google accounts/)).toBeTruthy();
        expect(screen.queryByTestId('connector-connect-google')).toBeNull();
        queryClient.clear();
    });
});

describe('browser sign-in links', () => {
    it('reads one query parameter, refusing a repeated one', () => {
        expect(queryParam('https://a.example/auth?state=a%2Fb&x=1#f', 'state')).toBe('a/b');
        expect(queryParam('https://a.example/auth?state=a&state=b', 'state')).toBeNull();
        expect(queryParam('https://a.example/auth', 'state')).toBeNull();
        expect(urlHost('https://Accounts.Google.com/o/oauth2?x=1')).toBe('accounts.google.com');
        expect(urlHost('https://accounts.google.com@evil.example/')).toBeNull();
    });

    it("knows the answer page's way back to the app and nothing else", () => {
        expect(isOAuthDoneLink(RETURN_URL)).toBe(true);
        expect(isOAuthDoneLink('/oauth-done')).toBe(true);
        expect(isOAuthDoneLink('ai.amd.gaia.mobile.dev://pair?code=1')).toBe(false);
        expect(isOAuthDoneLink('/oauth-done-later')).toBe(false);
    });
});
