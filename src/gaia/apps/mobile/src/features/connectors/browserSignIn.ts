// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { ConnectorList, ConnectorRow } from '@/api/client.types';
import { usePinned } from '@/api/routeAccess';
import { BROWSER_RETURN_GRACE_MS, BROWSER_SIGN_IN_TIMEOUT_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { deviceSignInScopes, queryKeys, useGaiaClient } from '@/data';

import { GOOGLE_CONNECTOR_ID } from './connectorList';

import type { LoopbackOutcome, OAuthLoopbackNative } from '../../../modules/gaia-oauth-loopback';

import { platformBrowserSignInDeps } from './browserSignInDeps';

/** What a browser sign-in from the phone needs from the platform; tests and the gallery pass their own. */
export interface BrowserSignInDeps {
    /** Null where the app has no listener (the web, builds made before it). */
    loopback: OAuthLoopbackNative | null;
    /** The app's own link for the answer page, `<scheme>://oauth-done`; null when the build has no scheme. */
    returnUrl(): string | null;
    /** ASWebAuthenticationSession on iOS, Custom Tabs on Android; resolves when the browser closes. */
    openAuthSession(url: string, returnUrl: string): Promise<{ type: string }>;
    dismissAuthSession(): void;
    /** Counts this phone as paired whatever the connection says; the gallery sets it, having no PC to pair with. */
    paired?: boolean;
}

/** Overrides the platform's deps (`platformBrowserSignInDeps`) for tests and the gallery. */
export const BrowserSignInDepsContext = createContext<BrowserSignInDeps | null>(null);

function useBrowserSignInDeps(): BrowserSignInDeps {
    const override = useContext(BrowserSignInDepsContext);
    return override ?? platformBrowserSignInDeps();
}

/**
 * True where this phone can connect a browser-sign-in connector itself: a build with the loopback listener, on a
 * paired phone. Anything else reaches the PC as the PC itself, whose own browser would open.
 */
export function useBrowserSignInAvailable(): boolean {
    const deps = useBrowserSignInDeps();
    const pinned = usePinned();
    return deps.loopback !== null && (deps.paired ?? pinned);
}

/**
 * `superseded`: a sign-in started on the PC or another device replaced this one. `expired`: the PC no longer has it
 * (15 minutes passed, or it was replaced while finishing). `stateMismatch`: the PC ended it.
 */
export type BrowserSignInFailure =
    | 'denied'
    | 'closed'
    | 'timeout'
    | 'superseded'
    | 'listenerLost'
    | 'expired'
    | 'stateMismatch'
    | 'rejected'
    | 'refused'
    | 'mismatch'
    | 'notHttps'
    | 'unavailable'
    | 'error';

export type BrowserSignIn =
    | { state: 'idle' }
    | { state: 'starting' }
    | { state: 'browser' }
    | { state: 'finishing' }
    | { state: 'done' }
    | { state: 'failed'; reason: BrowserSignInFailure; detail?: string; error?: Error };

/** One query parameter of a URL, decoded; null when it is absent, repeated or malformed. */
export function queryParam(url: string, name: string): string | null {
    const query = url.split('#', 1)[0]!.split('?').slice(1).join('?');
    let found: string | null = null;
    for (const pair of query.split('&')) {
        const eq = pair.indexOf('=');
        const key = eq < 0 ? pair : pair.slice(0, eq);
        if (key !== name) continue;
        if (found !== null) return null;
        try {
            found = decodeURIComponent((eq < 0 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '));
        } catch {
            return null;
        }
    }
    return found;
}

/** Where each connector's sign-in page must be; a link elsewhere isn't opened. */
const SIGN_IN_HOSTS: Record<string, string> = { [GOOGLE_CONNECTOR_ID]: 'accounts.google.com' };
/** The PC's state is 43 characters (secrets.token_urlsafe(32)); a short one isn't the PC's. */
const MIN_STATE_LENGTH = 32;

/** A URL's host, lowercased; null for one with credentials or no host. */
export function urlHost(url: string): string | null {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
    if (!match || !match[1] || match[1].includes('@')) return null;
    return match[1].toLowerCase();
}

/** The redirect the PC must have put in the link for this phone's listener to receive it. */
export function loopbackRedirectUri(port: number): string {
    return `http://127.0.0.1:${port}/callback`;
}

/** Why the PC refused starting (`start`) or finishing (`complete`) the sign-in; the PC's own words go on the detail line. */
export function pcFailure(error: unknown, step: 'start' | 'complete'): Extract<BrowserSignIn, { state: 'failed' }> {
    if (!(error instanceof GaiaApiError) || error.status === 401) {
        return { state: 'failed', reason: 'error', error: error instanceof Error ? error : new Error(String(error)) };
    }
    const detail = error.detail || undefined;
    if (error.status === 403) return { state: 'failed', reason: 'refused', detail };
    if (step === 'complete' && error.status === 404) return { state: 'failed', reason: 'expired', detail };
    if (step === 'complete' && error.status === 400) return { state: 'failed', reason: 'stateMismatch', detail };
    return { state: 'failed', reason: 'rejected', detail };
}

type Step = { kind: 'redirect'; outcome: LoopbackOutcome } | { kind: 'browser'; type: string } | { kind: 'pc'; completed: boolean; error?: string; reason?: string };

function failure(reason: BrowserSignInFailure, detail?: string): BrowserSignIn {
    return { state: 'failed', reason, ...(detail ? { detail } : {}) };
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Connects a browser-sign-in connector (Google) from the phone: this phone's loopback listener catches the
 * provider's redirect, and the PC, which holds the PKCE verifier, exchanges the code and keeps the account.
 * The code lives only inside one run of `start`; closing the tile cancels the listener and the PC's flow.
 */
export function useBrowserSignIn(connector: ConnectorRow, scopes: string[] = deviceSignInScopes(connector)) {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const deps = useBrowserSignInDeps();
    const [signIn, setSignIn] = useState<BrowserSignIn>({ state: 'idle' });
    const run = useRef(0);
    const active = useRef<{ id: number; flowId: string | null; watch: AbortController } | null>(null);
    const scopeKey = scopes.join(' ');

    // Ends the active run's listener, browser and PC flow; a finished run has nothing left to drop.
    const abandon = useCallback(
        (dropFlow: boolean) => {
            const current = active.current;
            active.current = null;
            if (!current) return;
            current.watch.abort();
            deps.loopback?.cancel();
            deps.dismissAuthSession();
            if (dropFlow && current.flowId && client) {
                client.cancelConnectorFlow(current.flowId).catch((error: unknown) => {
                    console.error(`Dropping the ${connector.id} sign-in on the PC failed`, error instanceof GaiaApiError ? error.status : error);
                });
            }
        },
        [client, connector.id, deps],
    );

    const start = useCallback(async () => {
        abandon(true);
        const mine = ++run.current;
        const live = () => run.current === mine;
        const loopback = deps.loopback;
        const returnUrl = loopback ? deps.returnUrl() : null;
        if (!loopback || !returnUrl || !client) {
            setSignIn(failure('unavailable'));
            return;
        }
        const current = { id: mine, flowId: null as string | null, watch: new AbortController() };
        active.current = current;
        const finish = (next: BrowserSignIn, dropFlow: boolean) => {
            if (!live()) return;
            if (active.current === current) abandon(dropFlow);
            setSignIn(next);
        };
        setSignIn({ state: 'starting' });

        let port: number;
        try {
            ({ port } = await loopback.start(returnUrl));
        } catch (error) {
            finish({ state: 'failed', reason: 'error', error: error as Error }, false);
            return;
        }
        if (!live()) {
            // Cancelled while the port was opening; a newer run's start has already replaced this listener.
            if (active.current === null) loopback.cancel();
            return;
        }

        let flow: { flow_id: string; authorization_url: string };
        try {
            flow = await client.startConnectorBrowserSignIn(connector.id, port, scopeKey ? scopeKey.split(' ') : [], { signal: current.watch.signal });
        } catch (error) {
            finish(pcFailure(error, 'start'), false);
            return;
        }
        current.flowId = flow.flow_id;
        if (!live()) {
            client.cancelConnectorFlow(flow.flow_id).catch((error: unknown) => console.error(`Dropping the ${connector.id} sign-in on the PC failed`, error));
            return;
        }

        const url = flow.authorization_url;
        if (!/^https:\/\//i.test(url)) return finish(failure('notHttps'), true);
        const state = queryParam(url, 'state');
        const host = SIGN_IN_HOSTS[connector.id];
        // A PC that took its own path would send the browser to its own listener, which this phone never hears.
        if (!state || state.length < MIN_STATE_LENGTH || queryParam(url, 'redirect_uri') !== loopbackRedirectUri(port) || (host && urlHost(url) !== host)) {
            return finish(failure('mismatch'), true);
        }

        setSignIn({ state: 'browser' });
        const redirect = loopback.waitForRedirect(state, BROWSER_SIGN_IN_TIMEOUT_MS).then((outcome): Step => ({ kind: 'redirect', outcome }));
        const browser = deps.openAuthSession(url, returnUrl).then((result): Step => ({ kind: 'browser', type: result.type }));
        const pc = client
            .watchConnectorSignIn(connector.id, { signal: current.watch.signal, flowId: flow.flow_id })
            .then((end): Step | Promise<never> => {
                if (!end) return new Promise<never>(() => undefined);
                return end.outcome === 'completed' ? { kind: 'pc', completed: true } : { kind: 'pc', completed: false, error: end.error, reason: end.reason };
            });

        let step: Step;
        try {
            step = await Promise.race([redirect, browser, pc]);
            if (step.kind === 'browser' && step.type === 'success') {
                // Any app can open the app's own link (Android ends the session on it), so only the listener says it's done.
                step = await Promise.race([redirect, pc]);
            } else if (step.kind === 'browser') {
                // The browser closes as the answer page sends it back, a moment before the listener's answer reaches here.
                step = await Promise.race([redirect, delay(BROWSER_RETURN_GRACE_MS).then((): Step => step)]);
            }
        } catch (error) {
            return finish({ state: 'failed', reason: 'error', error: error as Error }, true);
        }
        if (!live()) return;
        deps.dismissAuthSession();

        if (step.kind === 'browser') return finish(failure('closed'), true);
        if (step.kind === 'pc') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
            if (step.completed) return finish({ state: 'done' }, false);
            // The PC already dropped a replaced flow; any other end of this flow, it may still hold.
            return step.reason === 'superseded' ? finish(failure('superseded', step.error), false) : finish(failure('expired', step.error), true);
        }
        const outcome = step.outcome;
        if (outcome.outcome === 'timeout') return finish(failure('timeout'), true);
        if (outcome.outcome === 'cancelled') return finish({ state: 'idle' }, true);
        if (outcome.outcome === 'lost') return finish(failure('listenerLost'), true);
        if (outcome.outcome === 'error') return finish(outcome.error === 'access_denied' ? failure('denied') : failure('rejected', outcome.error), true);

        setSignIn({ state: 'finishing' });
        // From here the flow is the PC's to finish: it takes the flow out of its list before exchanging the code.
        current.flowId = null;
        let row: ConnectorRow;
        try {
            row = await client.completeConnectorBrowserSignIn(flow.flow_id, outcome.code, outcome.state);
        } catch (error) {
            return finish(pcFailure(error, 'complete'), false);
        }
        queryClient.setQueryData<ConnectorList>(queryKeys.connectors, (list) =>
            list ? { ...list, connectors: list.connectors.map((c) => (c.id === row.id ? row : c)) } : list,
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.connectors });
        finish({ state: 'done' }, false);
    }, [abandon, client, connector.id, deps, queryClient, scopeKey]);

    const cancel = useCallback(() => {
        run.current++;
        abandon(true);
        setSignIn({ state: 'idle' });
    }, [abandon]);

    // Closing the tile or the screen ends the listener and the PC's flow.
    useEffect(
        () => () => {
            run.current++;
            abandon(true);
        },
        [abandon],
    );

    return { signIn, start: () => void start(), cancel };
}
