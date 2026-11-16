// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { RouteOrigin } from './homeNetwork';
import { AWAY_DELAY_MS, chooseOrigin, HOME_PROBE_MS, type Choice, type NetworkClass, type ProbeResult } from './originChooser';

const HOME_A = 'https://192.168.1.20:4243';
const HOME_B = 'https://10.0.0.5:4243';
const TAILNET = 'https://100.100.1.2:4243';
const ROUTES: RouteOrigin[] = [
    { kind: 'home', origin: HOME_A },
    { kind: 'home', origin: HOME_B },
    { kind: 'tailnet', origin: TAILNET },
];

/** Each origin answers `result` after `ms`, or never; `started` records when each probe began. */
function race(plan: Record<string, { ms: number; result: ProbeResult } | 'silent'>, network: NetworkClass = 'local', bad = new Set<string>()) {
    const started: Record<string, number> = {};
    const t0 = Date.now();
    const probe = (origin: string, timeoutMs: number, signal: AbortSignal) =>
        new Promise<ProbeResult>((resolve) => {
            started[origin] = Date.now() - t0;
            const step = plan[origin];
            const timeout = setTimeout(() => resolve({ failure: 'unreachable' }), timeoutMs);
            signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                resolve({ failure: 'unreachable' });
            });
            if (step !== 'silent' && step) {
                setTimeout(() => {
                    clearTimeout(timeout);
                    resolve(step.result);
                }, step.ms);
            }
        });
    let choice: Choice | null = null;
    void chooseOrigin(ROUTES, { network, bad, probe }).then((c) => (choice = c));
    return { started, bad, choice: () => choice };
}

const ok = (ms: number) => ({ ms, result: { status: 200 } });
const mismatch = (ms: number) => ({
    ms,
    result: { failure: 'pin_mismatch' as const },
});
const down = (ms: number) => ({
    ms,
    result: { failure: 'unreachable' as const },
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('chooseOrigin', () => {
    it('takes the home address that answers first, without trying the away route', async () => {
        const r = race({ [HOME_A]: ok(50), [HOME_B]: ok(20), [TAILNET]: ok(10) });
        await jest.advanceTimersByTimeAsync(30);
        expect(r.choice()).toEqual({ state: 'chosen', origin: HOME_B });
        expect(r.started[TAILNET]).toBeUndefined();
    });

    it('starts the away route after 400 ms of no answer, and takes it when home stays silent', async () => {
        const r = race({
            [HOME_A]: 'silent',
            [HOME_B]: 'silent',
            [TAILNET]: ok(100),
        });
        await jest.advanceTimersByTimeAsync(AWAY_DELAY_MS + 100);
        // Answered, but held: home might still answer.
        expect(r.started[TAILNET]).toBe(AWAY_DELAY_MS);
        expect(r.choice()).toBeNull();
        await jest.advanceTimersByTimeAsync(HOME_PROBE_MS);
        expect(r.choice()).toEqual({ state: 'chosen', origin: TAILNET });
    });

    it('prefers home when both answer', async () => {
        const r = race({
            [HOME_A]: ok(700),
            [HOME_B]: 'silent',
            [TAILNET]: ok(10),
        });
        await jest.advanceTimersByTimeAsync(800);
        expect(r.choice()).toEqual({ state: 'chosen', origin: HOME_A });
    });

    it('goes away at once when every home address has failed', async () => {
        const r = race({
            [HOME_A]: down(5),
            [HOME_B]: down(10),
            [TAILNET]: ok(20),
        });
        await jest.advanceTimersByTimeAsync(40);
        expect(r.started[TAILNET]).toBe(10);
        expect(r.choice()).toEqual({ state: 'chosen', origin: TAILNET });
    });

    it('skips home addresses on cellular', async () => {
        const r = race({ [HOME_A]: ok(1), [HOME_B]: ok(1), [TAILNET]: ok(30) }, 'cellular');
        await jest.advanceTimersByTimeAsync(40);
        expect(Object.keys(r.started)).toEqual([TAILNET]);
        expect(r.choice()).toEqual({ state: 'chosen', origin: TAILNET });
    });

    it('marks a mismatched address bad for this network, and fails hard only when no address answered', async () => {
        const first = race({
            [HOME_A]: mismatch(5),
            [HOME_B]: down(5),
            [TAILNET]: ok(20),
        });
        await jest.advanceTimersByTimeAsync(40);
        expect(first.choice()).toEqual({ state: 'chosen', origin: TAILNET });
        expect([...first.bad]).toEqual([HOME_A]);

        const second = race({ [HOME_A]: ok(1), [HOME_B]: down(5), [TAILNET]: down(5) }, 'local', first.bad);
        await jest.advanceTimersByTimeAsync(20);
        expect(second.started[HOME_A]).toBeUndefined();
        expect(second.choice()).toEqual({ state: 'unreachable' });

        const third = race({
            [HOME_A]: mismatch(1),
            [HOME_B]: mismatch(1),
            [TAILNET]: down(5),
        });
        await jest.advanceTimersByTimeAsync(20);
        expect(third.choice()).toEqual({ state: 'pin_mismatch', origin: HOME_A });
    });

    it('reports a revoked token from any address', async () => {
        const r = race({
            [HOME_A]: { ms: 5, result: { status: 401 } },
            [HOME_B]: ok(50),
            [TAILNET]: 'silent',
        });
        await jest.advanceTimersByTimeAsync(10);
        expect(r.choice()).toEqual({ state: 'gone' });
    });
});
