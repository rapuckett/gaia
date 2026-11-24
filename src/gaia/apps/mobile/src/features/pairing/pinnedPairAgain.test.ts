// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useConnectionStore } from '@/state/connection';

import { createPinnedPairingService } from './pinnedPairingService';

// A model of the native transport: each vault entry holds a pin and a token; a server shows a certificate. The token
// goes out only after the server has shown the pinned certificate, as TLS pinning does.
interface Secret {
    pin: string;
    token: string;
}
interface Server {
    cert: string;
    /** No server at this address, or one that never answers. */
    down?: 'refused' | 'silent';
    health?: { status: number; bearer?: boolean };
    /** Holds the DELETE until released. */
    hold?: Promise<void>;
}

const mockVault = new Map<string, Secret>();
const mockServers = new Map<string, Server>();
const mockSent: { origin: string; method: string; path: string; token: string }[] = [];
const mockUnpaired: { pcId: string; pcKnowsPhone: boolean }[] = [];

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'iPhone' }));
jest.mock('./unpairListeners', () => ({
    notifyUnpair: async (pcId: string, pcKnowsPhone: boolean) => void mockUnpaired.push({ pcId, pcKnowsPhone }),
    notifyWipeAll: async () => undefined,
}));
jest.mock('../../../modules/gaia-transport', () => ({
    transportAvailable: true,
    GaiaTransport: {
        dropAll: async () => void mockVault.clear(),
        drop: async (id: string) => void mockVault.delete(id),
        promote: async (from: string, to: string) => {
            if (!mockVault.has(from)) throw Object.assign(new Error('not paired'), { code: 'not_paired' });
            mockVault.set(to, mockVault.get(from)!);
            mockVault.delete(from);
        },
        isPaired: (id: string) => mockVault.has(id),
        setOrigins: async () => undefined,
    },
}));
jest.mock('@/platform/pinnedFetch', () => ({
    onDeviceGone: () => undefined,
    transportError: (err: unknown) => err,
    reportIfDeviceGone: (_pcId: string, res: unknown) => res,
    reportIfNetworkFailure: (err: unknown) => {
        throw err;
    },
    pinnedFetch: async (vaultId: string, url: string, init: { method?: string; signal?: AbortSignal } = {}) => {
        const secret = mockVault.get(vaultId);
        if (!secret) throw Object.assign(new Error('not paired'), { code: 'not_paired' });
        const { origin, pathname } = new URL(url);
        const server = mockServers.get(origin);
        if (!server || server.down === 'refused') throw Object.assign(new Error('refused'), { code: 'network' });
        const aborted = () => Object.assign(new Error('The request was canceled.'), { code: 'aborted' });
        if (init.signal?.aborted) throw aborted();
        if (server.down === 'silent') {
            return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(aborted())));
        }
        // The handshake: a certificate other than the pinned one ends it before any header, the token among them, is sent.
        if (server.cert !== secret.pin) throw new (jest.requireActual('@/api/errors').GaiaPinMismatchError)();
        const method = init.method ?? 'GET';
        mockSent.push({ origin, method, path: pathname, token: secret.token });
        if (method === 'DELETE') {
            if (server.hold) {
                await new Promise<void>((resolve, reject) => {
                    server.hold!.then(resolve);
                    init.signal?.addEventListener('abort', () => reject(aborted()));
                });
            }
            return { ok: true, status: 204, headers: { get: () => null }, text: async () => '' };
        }
        const health = server.health ?? { status: 200 };
        return {
            ok: health.status >= 200 && health.status < 300,
            status: health.status,
            headers: { get: (name: string) => (name.toLowerCase() === 'www-authenticate' && health.bearer ? 'Bearer realm="gaia"' : null) },
            text: async () => '{}',
        };
    },
}));

const PC = 'a1'.repeat(16);
const OTHER = 'b2'.repeat(16);
const HOME = 'https://192.168.1.20:4243';
const AWAY = 'https://100.101.102.103:4243';
const OLD_CERT = 'old-cert-pin';
const NEW_CERT = 'new-cert-pin';

async function savePcs(extra: Record<string, unknown> = {}) {
    await AsyncStorage.setItem(
        'gaia:paired-pcs',
        JSON.stringify({
            pcs: [
                { id: PC, name: 'Office PC', origin: HOME, origins: [{ kind: 'home', origin: HOME }, { kind: 'tailnet', origin: AWAY }], deviceId: 'dev-1' },
                { id: OTHER, name: 'Den PC', origin: 'https://192.168.1.30:4243', deviceId: 'dev-9' },
            ],
            currentId: PC,
            pending: null,
            ...extra,
        }),
    );
}

async function saved() {
    return JSON.parse((await AsyncStorage.getItem('gaia:paired-pcs'))!) as { pcs: { id: string }[]; currentId: string | null; leaving: { id: string }[] };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('gaia:install-marker', 'set');
    mockVault.clear();
    mockServers.clear();
    mockSent.length = 0;
    mockUnpaired.length = 0;
    mockVault.set(PC, { pin: OLD_CERT, token: 'office-token' });
    mockVault.set(OTHER, { pin: 'den-cert', token: 'den-token' });
    await savePcs();
    useConnectionStore.getState().setConnection({ baseUrl: HOME, pcId: PC, pinned: true });
});

describe('asking a PC whose certificate changed whether it still knows this phone', () => {
    it('counts only a 2xx over the pinned certificate as known', async () => {
        mockServers.set(HOME, { cert: OLD_CERT, health: { status: 200 } });
        mockServers.set(AWAY, { cert: OLD_CERT, down: 'refused' });
        expect(await createPinnedPairingService().recheck(PC)).toEqual({ state: 'known' });
    });

    it('never counts a 2xx from a server showing another certificate, and sends it no token', async () => {
        mockServers.set(HOME, { cert: NEW_CERT, health: { status: 200 } });
        mockServers.set(AWAY, { cert: NEW_CERT, health: { status: 200 } });
        expect(await createPinnedPairingService().recheck(PC)).toEqual({ state: 'unknown' });
        expect(mockSent).toEqual([]);
    });

    it('takes a refused token (401 Bearer) over the pinned certificate as not known', async () => {
        mockServers.set(HOME, { cert: OLD_CERT, health: { status: 401, bearer: true } });
        expect(await createPinnedPairingService().recheck(PC)).toEqual({ state: 'unknown' });
    });

    it('decides nothing on no answer, a 5xx, or a changed certificate at only some addresses', async () => {
        const service = createPinnedPairingService();
        mockServers.set(HOME, { cert: OLD_CERT, down: 'refused' });
        expect(await service.recheck(PC)).toEqual({ state: 'unreachable' });
        mockServers.set(HOME, { cert: OLD_CERT, health: { status: 503 } });
        expect(await service.recheck(PC)).toEqual({ state: 'unreachable' });
        mockServers.set(HOME, { cert: NEW_CERT });
        mockServers.set(AWAY, { cert: OLD_CERT, down: 'refused' });
        expect(await service.recheck(PC)).toEqual({ state: 'unreachable' });
        mockServers.set(HOME, { cert: OLD_CERT, health: { status: 401 } });
        expect(await service.recheck(PC)).toEqual({ state: 'unreachable' });
    });

    it('ends when the caller gives up on a PC that never answers', async () => {
        mockServers.set(HOME, { cert: OLD_CERT, down: 'silent' });
        mockServers.set(AWAY, { cert: OLD_CERT, down: 'silent' });
        const controller = new AbortController();
        const asking = createPinnedPairingService().recheck(PC, controller.signal);
        controller.abort();
        expect(await asking).toEqual({ state: 'unreachable' });
    });

    it('makes the address that answered the one in use', async () => {
        mockServers.set(HOME, { cert: NEW_CERT });
        mockServers.set(AWAY, { cert: OLD_CERT, health: { status: 200 } });
        expect(await createPinnedPairingService().recheck(PC)).toEqual({ state: 'known' });
        expect(useConnectionStore.getState().connection?.baseUrl).toBe(AWAY);
        expect(mockSent.map((s) => s.origin)).toEqual([AWAY]);
    });

    it('changes nothing on the phone while asking', async () => {
        mockServers.set(HOME, { cert: NEW_CERT });
        await createPinnedPairingService().recheck(PC);
        expect(mockVault.get(PC)).toEqual({ pin: OLD_CERT, token: 'office-token' });
        expect((await saved()).pcs.map((p) => p.id)).toEqual([PC, OTHER]);
    });
});

describe('forgetting a PC', () => {
    it('is done on the phone before the PC is told, and picks no other PC', async () => {
        let release = () => {};
        mockServers.set(HOME, { cert: OLD_CERT, hold: new Promise<void>((resolve) => (release = resolve)) });
        const service = createPinnedPairingService();
        await service.forget(PC);

        expect((await service.list()).map((p) => p.id)).toEqual([OTHER]);
        expect((await saved()).currentId).toBeNull();
        expect(useConnectionStore.getState().connection).toBeNull();
        expect(mockVault.has(PC)).toBe(false);

        for (let i = 0; i < 5; i++) await flush();
        expect(mockUnpaired).toEqual([{ pcId: PC, pcKnowsPhone: false }]);
        expect(mockSent).toEqual([{ origin: HOME, method: 'DELETE', path: '/api/devices/me', token: 'office-token' }]);
        expect(mockVault.has(`${PC}.leaving.dev-1`)).toBe(true);

        release();
        for (let i = 0; i < 5; i++) await flush();
        expect([...mockVault.keys()]).toEqual([OTHER]);
        expect((await saved()).leaving).toEqual([]);
    });

    it('stops waiting for a PC that never answers, and drops its key anyway', async () => {
        jest.useFakeTimers();
        try {
            mockServers.set(HOME, { cert: OLD_CERT, hold: new Promise<void>(() => undefined) });
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            await createPinnedPairingService().forget(PC);
            expect(mockVault.has(`${PC}.leaving.dev-1`)).toBe(true);
            await jest.advanceTimersByTimeAsync(10_000);
            expect([...mockVault.keys()]).toEqual([OTHER]);
            expect((await saved()).leaving).toEqual([]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("Couldn't tell Office PC to unpair this phone"), expect.anything());
        } finally {
            jest.useRealTimers();
            jest.restoreAllMocks();
        }
    });

    it('sends no token to a PC showing a changed certificate, and keeps nothing of it', async () => {
        mockServers.set(HOME, { cert: NEW_CERT });
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        await createPinnedPairingService().forget(PC);
        for (let i = 0; i < 5; i++) await flush();
        jest.restoreAllMocks();
        expect(mockSent).toEqual([]);
        expect([...mockVault.values()].some((s) => s.pin === NEW_CERT)).toBe(false);
        expect(JSON.stringify(await saved())).not.toContain(NEW_CERT);
        expect([...mockVault.keys()]).toEqual([OTHER]);
    });

    it('finishes at the next start after a kill, and leaves a PC paired again since alone', async () => {
        const leaving = { id: PC, name: 'Office PC', origin: HOME, origins: [{ kind: 'home', origin: HOME }], deviceId: 'dev-1' };
        mockServers.set(HOME, { cert: OLD_CERT });

        // Killed after the list was saved: the key is still under the PC's own id.
        await savePcs({ pcs: [], currentId: null, leaving: [leaving] });
        await createPinnedPairingService().restore();
        for (let i = 0; i < 5; i++) await flush();
        expect(mockSent).toEqual([{ origin: HOME, method: 'DELETE', path: '/api/devices/me', token: 'office-token' }]);
        expect(mockVault.has(PC)).toBe(false);
        expect((await saved()).leaving).toEqual([]);

        // Paired again before the old pairing was finished: the new key stays.
        mockSent.length = 0;
        mockVault.set(PC, { pin: OLD_CERT, token: 'new-token' });
        await savePcs({ leaving: [leaving] });
        await createPinnedPairingService().restore();
        for (let i = 0; i < 5; i++) await flush();
        expect(mockSent).toEqual([]);
        expect(mockVault.get(PC)).toEqual({ pin: OLD_CERT, token: 'new-token' });
        expect((await saved()).leaving).toEqual([]);
    });
});
