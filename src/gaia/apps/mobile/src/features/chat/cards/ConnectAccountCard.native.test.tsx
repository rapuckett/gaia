// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { ConnectorRow } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { BROWSER_RETURN_GRACE_MS, BROWSER_SIGN_IN_HANDOFF_MS } from '@/api/constants';
import { BrowserSignInDepsContext, type BrowserSignInDeps } from '@/features/connectors/browserSignIn';

import type { LoopbackOutcome } from '../../../../modules/gaia-oauth-loopback';
import { ThemeProvider } from '@/ui';

import { EmailConnect } from '../EmailConnect';
import { ConnectAccountCard } from './ConnectAccountCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const row = (over: Partial<ConnectorRow>) =>
    ({
        type: 'oauth_pkce',
        description: '',
        configured: false,
        configurable: true,
        supports_device_code: false,
        scopes: [],
        default_scopes: ['openid', 'offline_access'],
        available_scopes: ['openid', 'offline_access', 'Mail.Read', 'Mail.Send'],
        oauth_setup_fields: [],
        account_id: null,
        activations: {},
        ...over,
    }) as unknown as ConnectorRow;

const microsoft = row({ id: 'microsoft', display_name: 'Microsoft Personal', supports_device_code: true });
const google = row({ id: 'google', display_name: 'Google' });
const code = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 60, message: '' };

function setup(data: FakeClientData, deps?: BrowserSignInDeps) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <BrowserSignInDepsContext.Provider value={deps ?? null}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </BrowserSignInDepsContext.Provider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, wrapper };
}

describeNative('ConnectAccountCard', () => {
    it("signs in with a code for the access the call needs, grants no agent, and keeps Google on the PC", async () => {
        const { client, wrapper } = setup({ connectors: [microsoft, google], deviceSignIn: code });
        const start = jest.spyOn(client, 'startConnectorDeviceSignIn');
        const card = { kind: 'connect_account', providers: ['microsoft', 'google'], agent_id: 'builtin:gaia', scopes: { microsoft: ['Mail.Read'] } };
        await render(<ConnectAccountCard data={card} />, { wrapper });

        await fireEvent.press(await screen.findByText('Connect Microsoft'));
        expect(await screen.findByText(/ABCD-EFGH/)).toBeTruthy();
        expect(start).toHaveBeenCalledTimes(1);
        const [id, scopes, ...rest] = start.mock.calls[0];
        expect(id).toBe('microsoft');
        expect([...scopes].sort()).toEqual(['Mail.Read', 'offline_access', 'openid']);
        expect(rest.filter((r) => r !== undefined)).toEqual([]);

        await fireEvent.press(screen.getByText('Connect Google'));
        expect(await screen.findByText(/Connect your account on your PC/)).toBeTruthy();
    });

    it('shows the needs-setup state and the cancelled sign-in the PC reports', async () => {
        const { wrapper } = setup({
            connectors: [microsoft, row({ id: 'google', display_name: 'Google', configurable: false })],
            deviceSignIn: code,
            signInEnd: { outcome: 'cancelled' },
        });
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['microsoft', 'google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Set up Google'));
        expect(mockPush).toHaveBeenCalledWith('/connectors');

        await fireEvent.press(screen.getByText('Connect Microsoft'));
        expect(await screen.findByText('Sign-in was canceled. Press Connect to try again.')).toBeTruthy();
    });
});

const loopbackDeps = (loopback: BrowserSignInDeps['loopback']): BrowserSignInDeps => ({
    loopback,
    returnUrl: () => 'ai.amd.gaia.mobile.dev://oauth-done',
    openAuthSession: jest.fn(() => new Promise<{ type: string }>(() => undefined)),
    dismissAuthSession: jest.fn(),
    paired: true,
});

describeNative('Google in the chat on a paired phone', () => {
    const listener = { start: jest.fn(async () => ({ port: 50123 })), waitForRedirect: jest.fn(() => new Promise<never>(() => undefined)), cancel: jest.fn() };

    const state = 'pc-state-0123456789abcdefghijklmnopqrstuvwx';

    it('signs in with the phone browser from the card', async () => {
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, loopbackDeps(listener));
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();
        expect(client.browserSignIns).toHaveLength(1);
        expect(screen.queryByText(/Connect your account on your PC/)).toBeNull();
    });

    it('offers to reconnect the account that failed, and another account beside it, each with its own target', async () => {
        const accounts = [
            { account_id: 'id-a', email: 'avery@example.com', status: 'ok' as const, is_default: true },
            { account_id: 'id-b', email: 'blake@example.com', status: 'reauth_required' as const, is_default: false },
        ];
        const { client, wrapper } = setup({ connectors: [{ ...google, configured: true, accounts } as ConnectorRow], browserSignInState: state }, loopbackDeps(listener));
        const card = { kind: 'connect_account', providers: ['google'], reconnect: ['google'], account: { google: 'id-b' } };
        await render(<ConnectAccountCard data={card} />, { wrapper });
        expect(screen.queryByText(/Connect Google|Google is connected/)).toBeNull();
        expect(await screen.findByText('Use a different account')).toBeTruthy();
        await fireEvent.press(await screen.findByText(/Reconnect .*blake@example.com/));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();
        expect(client.browserSignIns.at(-1)?.target).toEqual({ account: 'id-b' });
    });

    it('adds another account from the card with the provider picker', async () => {
        const accounts = [
            { account_id: 'id-a', email: 'avery@example.com', status: 'ok' as const, is_default: true },
            { account_id: 'id-b', email: 'blake@example.com', status: 'ok' as const, is_default: false },
        ];
        const { client, wrapper } = setup({ connectors: [{ ...google, configured: true, accounts } as ConnectorRow], browserSignInState: state }, loopbackDeps(listener));
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Use a different account'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();
        expect(client.browserSignIns.at(-1)?.target).toEqual({ addAccount: true });
    });

    it('signs in with the phone browser from the email block', async () => {
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, loopbackDeps(listener));
        await render(<EmailConnect content="NOT_CONNECTED: google is not currently connected." />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();
        expect(client.browserSignIns).toHaveLength(1);
    });

    it("says why the browser sign-in failed instead of the card's generic line", async () => {
        const lost = { ...listener, waitForRedirect: jest.fn(async () => ({ outcome: 'lost' as const })) };
        const { wrapper } = setup({ connectors: [google], browserSignInState: state }, loopbackDeps(lost));
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByText(/stopped listening for the sign-in/)).toBeTruthy();
        expect(screen.queryByText('Sign-in did not finish.')).toBeNull();
    });

    it('keeps the PC note where the build has no listener', async () => {
        const { client, wrapper } = setup({ connectors: [google] }, loopbackDeps(null));
        await render(<ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByText(/Connect your account on your PC/)).toBeTruthy();
        expect(client.browserSignIns).toHaveLength(0);
    });
});

const PROMPT = 'GAIA needs you to connect an account for this.';
const CANCELLED = 'Sign-in was canceled. Press Connect to try again.';
const GOOGLE_CARD = { kind: 'connect_account', providers: ['google'] };
const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** As Android does it: the browser ends when the app is back in front, and a cancel ends the listener's wait. */
function phoneDeps() {
    let wake: ((outcome: LoopbackOutcome) => void) | null = null;
    let closeBrowser: ((result: { type: string }) => void) | null = null;
    const loopback = {
        start: jest.fn(async () => ({ port: 50123 })),
        waitForRedirect: jest.fn(() => new Promise<LoopbackOutcome>((resolve) => (wake = resolve))),
        cancel: jest.fn(() => wake?.({ outcome: 'cancelled' })),
    };
    const deps: BrowserSignInDeps = {
        ...loopbackDeps(loopback),
        openAuthSession: jest.fn(() => new Promise<{ type: string }>((resolve) => (closeBrowser = resolve))),
    };
    return { deps, loopback, closeBrowser: () => act(() => closeBrowser?.({ type: 'dismiss' })) };
}

describeNative('Google sign-in from a chat card that remounts', () => {
    const state = 'pc-state-0123456789abcdefghijklmnopqrstuvwx';
    const appState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
    let onChange: ((next: AppStateStatus) => void)[] = [];
    const goTo = (next: AppStateStatus) =>
        act(() => {
            Object.defineProperty(AppState, 'currentState', { value: next, configurable: true });
            for (const handler of onChange) handler(next);
        });

    beforeEach(() => {
        onChange = [];
        jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (next: AppStateStatus) => void) => {
            onChange.push(handler);
            return { remove: () => (onChange = onChange.filter((h) => h !== handler)) };
        }) as unknown as typeof AppState.addEventListener);
    });
    afterEach(() => {
        jest.restoreAllMocks();
        Object.defineProperty(AppState, 'currentState', appState);
    });

    // The turn's card is drawn by the live tail, then by the saved reply: a new card each time.
    const Card = ({ at }: { at: string }) => <ConnectAccountCard key={at} data={GOOGLE_CARD} />;

    it('keeps waiting when the turn is saved while the browser is in front, and across the return', async () => {
        const { deps, loopback } = phoneDeps();
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, deps);
        const view = await render(<Card at="tail" />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();

        await goTo('background');
        await view.rerender(<Card at="saved" />);
        await pause(BROWSER_SIGN_IN_HANDOFF_MS + 200);
        expect(screen.getByTestId('browser-sign-in-block')).toBeTruthy();

        await goTo('active');
        await pause(BROWSER_SIGN_IN_HANDOFF_MS + 200);
        expect(screen.getByTestId('browser-sign-in-block')).toBeTruthy();
        expect(screen.queryByText('Connect Google')).toBeNull();
        expect(loopback.cancel).not.toHaveBeenCalled();
        expect(client.flowCancels).toEqual([]);
        expect(client.browserSignIns).toHaveLength(1);
    }, 10_000);

    it('says the sign-in was cancelled when the browser closes after the card remounted, and keeps saying so', async () => {
        const { deps, loopback, closeBrowser } = phoneDeps();
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, deps);
        const view = await render(<Card at="tail" />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();

        await goTo('background');
        await view.rerender(<Card at="saved" />);
        await goTo('active');
        await closeBrowser();
        expect(await screen.findByText(CANCELLED, {}, { timeout: BROWSER_RETURN_GRACE_MS + 1_000 })).toBeTruthy();
        expect(screen.getByText('Connect Google')).toBeTruthy();
        expect(screen.queryByText(PROMPT)).toBeNull();
        expect(loopback.cancel).toHaveBeenCalledTimes(1);
        expect(client.flowCancels).toEqual(['flow-1']);

        await view.rerender(<Card at="again" />);
        expect(await screen.findByText(CANCELLED)).toBeTruthy();
        expect(screen.queryByText(PROMPT)).toBeNull();
    }, 10_000);

    it("says cancelled when the browser ends the listener, but goes quietly back to Connect on GAIA's own Cancel", async () => {
        const { deps, loopback } = phoneDeps();
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, deps);
        await render(<Card at="tail" />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();

        // Android ends the Custom Tab, and with it the listener's wait.
        await act(async () => loopback.cancel());
        expect(await screen.findByTestId('connect-card-cancelled')).toBeTruthy();
        expect(screen.getByText(CANCELLED)).toBeTruthy();
        expect(client.flowCancels).toEqual(['flow-1']);

        await fireEvent.press(screen.getByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();
        expect(screen.getByText(PROMPT)).toBeTruthy();
        expect(client.browserSignIns).toHaveLength(2);
        await fireEvent.press(screen.getByTestId('browser-sign-in-cancel'));
        expect(await screen.findByText('Connect Google')).toBeTruthy();
        expect(screen.getByText(PROMPT)).toBeTruthy();
        expect(screen.queryByText(CANCELLED)).toBeNull();
        expect(client.flowCancels).toEqual(['flow-1', 'flow-2']);
    });

    it('ends the sign-in once no card shows it any more', async () => {
        const { deps, loopback } = phoneDeps();
        const { client, wrapper } = setup({ connectors: [google], browserSignInState: state }, deps);
        const view = await render(<Card at="tail" />, { wrapper });
        await fireEvent.press(await screen.findByText('Connect Google'));
        expect(await screen.findByTestId('browser-sign-in-block')).toBeTruthy();

        await view.rerender(<></>);
        await pause(BROWSER_SIGN_IN_HANDOFF_MS + 200);
        expect(loopback.cancel).toHaveBeenCalledTimes(1);
        expect(client.flowCancels).toEqual(['flow-1']);
        await view.rerender(<Card at="later" />);
        expect(await screen.findByText(PROMPT)).toBeTruthy();
    }, 10_000);
});

describeNative('EmailConnect', () => {
    it('offers only the mailbox the error names, signing in with a code', async () => {
        const { wrapper } = setup({ connectors: [microsoft, google], deviceSignIn: code });
        await render(<EmailConnect content="NOT_CONNECTED: microsoft is not currently connected." />, { wrapper });
        expect(await screen.findByText('Connect your email account to use Email Triage.')).toBeTruthy();
        expect(screen.queryByText('Connect Google')).toBeNull();
        await fireEvent.press(await screen.findByText('Connect Microsoft'));
        expect(await screen.findByText(/ABCD-EFGH/)).toBeTruthy();
    });
});
