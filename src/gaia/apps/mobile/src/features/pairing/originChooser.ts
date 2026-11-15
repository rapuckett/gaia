// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { RouteOrigin } from './homeNetwork';

/** How long a home address gets to answer, and how long before the away routes are tried as well. */
export const HOME_PROBE_MS = 1500;
export const AWAY_DELAY_MS = 400;
/** Away routes can cross a Tailscale DERP server or a relay, so they get longer. */
export const AWAY_PROBE_MS = 5000;

/** `local` is Wi-Fi, Ethernet or anything not known to be cellular: home addresses go first there. */
export type NetworkClass = 'local' | 'cellular';

/** What one pinned `GET /api/health` came to: an HTTP status from the pinned PC, or the transport's failure code. */
export type ProbeResult = { status: number } | { failure: 'pin_mismatch' | 'unreachable' };

export type Choice =
    | { state: 'chosen'; origin: string }
    /** The PC refused this phone's token: it was unpaired there. */
    | { state: 'gone' }
    /** No address answered, and at least one showed a certificate that isn't the paired PC's. */
    | { state: 'pin_mismatch'; origin: string }
    | { state: 'unreachable' };

export interface ChooseOptions {
    network: NetworkClass;
    /** Addresses whose certificate didn't match on this network; skipped, and added to on a mismatch. */
    bad: Set<string>;
    probe(origin: string, timeoutMs: number, signal: AbortSignal): Promise<ProbeResult>;
    signal?: AbortSignal;
}

/**
 * A staggered race: home addresses first (skipped on cellular, where a private address is never our PC),
 * then the away routes after AWAY_DELAY_MS or as soon as every home address has failed. The first address
 * to answer over the pinned connection wins, except that an answering home address beats an away one.
 */
export function chooseOrigin(origins: RouteOrigin[], options: ChooseOptions): Promise<Choice> {
    const { network, bad, probe } = options;
    const usable = origins.filter((o) => !bad.has(o.origin));
    const home = network === 'cellular' ? [] : usable.filter((o) => o.kind === 'home');
    const away = usable.filter((o) => o.kind !== 'home');
    const controller = new AbortController();

    return new Promise<Choice>((resolve, reject) => {
        let homePending = home.length;
        let pending = 0;
        let awayStarted = false;
        let awayTimer: ReturnType<typeof setTimeout> | null = null;
        let heldAway: string | null = null;
        let mismatched: string | null = null;
        let done = false;

        const stop = () => {
            done = true;
            if (awayTimer) clearTimeout(awayTimer);
            options.signal?.removeEventListener('abort', abort);
            controller.abort();
        };
        const finish = (choice: Choice) => {
            if (done) return;
            stop();
            resolve(choice);
        };
        const abort = () => finish({ state: 'unreachable' });
        options.signal?.addEventListener('abort', abort);

        const settleIfIdle = () => {
            if (done || pending > 0 || (!awayStarted && away.length > 0)) return;
            if (heldAway) finish({ state: 'chosen', origin: heldAway });
            else if (mismatched) finish({ state: 'pin_mismatch', origin: mismatched });
            else finish({ state: 'unreachable' });
        };

        const run = (route: RouteOrigin, timeoutMs: number) => {
            pending += 1;
            const isHome = route.kind === 'home';
            probe(route.origin, timeoutMs, controller.signal).then(
                (result) => {
                    pending -= 1;
                    if (isHome) homePending -= 1;
                    if (done) return;
                    if ('status' in result) {
                        if (result.status === 401) return finish({ state: 'gone' });
                        if (isHome) return finish({ state: 'chosen', origin: route.origin });
                        if (homePending === 0) return finish({ state: 'chosen', origin: route.origin });
                        heldAway ??= route.origin;
                        return;
                    }
                    if (result.failure === 'pin_mismatch') {
                        bad.add(route.origin);
                        mismatched ??= route.origin;
                    }
                    if (isHome && homePending === 0) {
                        if (heldAway) return finish({ state: 'chosen', origin: heldAway });
                        startAway();
                    }
                    settleIfIdle();
                },
                (err: unknown) => {
                    if (done) return;
                    stop();
                    reject(err);
                },
            );
        };

        const startAway = () => {
            if (awayStarted || done) return;
            awayStarted = true;
            if (awayTimer) clearTimeout(awayTimer);
            for (const route of away) run(route, AWAY_PROBE_MS);
        };

        if (options.signal?.aborted) return finish({ state: 'unreachable' });
        // Every address showed the wrong certificate on this network already.
        if (usable.length === 0 && origins.length > 0) return finish({ state: 'pin_mismatch', origin: origins[0].origin });
        for (const route of home) run(route, HOME_PROBE_MS);
        if (home.length === 0) startAway();
        else if (away.length > 0) awayTimer = setTimeout(startAway, AWAY_DELAY_MS);
        settleIfIdle();
    });
}
