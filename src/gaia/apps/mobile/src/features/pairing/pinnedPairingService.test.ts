// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { platformFetch } from '@/platform/fetch';
import { useConnectionStore } from '@/state/connection';

import type { PairingInvite } from './invite';
import { createPinnedPairingService } from './pinnedPairingService';

const mockVault = new Map<string, string>();
const mockNativeOrigins = new Map<string, string>();
let mockHealth = 403;
let mockRoutes: { status: number; body: string } = { status: 404, body: '{"detail":"Not Found"}' };
let mockPcName = 'Office PC';
const mockSent: { vaultId: string; url: string }[] = [];

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'iPhone' }));
jest.mock('../../../modules/gaia-transport', () => ({
    transportAvailable: true,
    GaiaTransport: {
        pair: async (vaultId: string, origins: string[]) => {
            mockVault.set(vaultId, `secret from ${origins[0]}`);
            return { status: 200, origin: origins[0], body: JSON.stringify({ device_id: 'dev-2', pc_name: mockPcName }) };
        },
        dropAll: async () => void mockVault.clear(),
        drop: async (vaultId: string) => void mockVault.delete(vaultId),
        promote: async (from: string, to: string) => {
            mockVault.set(to, mockVault.get(from)!);
            mockVault.delete(from);
        },
        isPaired: (vaultId: string) => mockVault.has(vaultId),
        setOrigins: async (vaultId: string, json: string) => void mockNativeOrigins.set(vaultId, json),
    },
}));
jest.mock('@/platform/pinnedFetch', () => ({
    onDeviceGone: () => undefined,
    transportError: (err: unknown) => err,
    reportIfDeviceGone: (_pcId: string, res: unknown) => res,
    reportIfNetworkFailure: (err: unknown) => {
        throw err;
    },
    pinnedFetch: async (vaultId: string, url: string) => {
        mockSent.push({ vaultId, url });
        if (!mockVault.has(vaultId)) throw Object.assign(new Error('not paired'), { code: 'not_paired' });
        if (url.endsWith('/api/devices/me/routes')) return { ok: mockRoutes.status === 200, status: mockRoutes.status, text: async () => mockRoutes.body };
        const body = mockHealth === 403 ? JSON.stringify({ code: 'device_pending' }) : '{}';
        return { ok: mockHealth === 200, status: mockHealth, text: async () => body };
    },
}));

const PC_ID = 'a1'.repeat(16);
const invite: PairingInvite = {
    v: 1,
    name: 'Office PC',
    pc_id: PC_ID,
    origins: ['https://192.168.1.99:4243'],
    pin: 'ab'.repeat(32),
    invite: 'abc',
    exp: Date.now() / 1000 + 600,
};

beforeEach(async () => {
    await AsyncStorage.removeItem('gaia:install-marker');
    mockVault.clear();
    mockNativeOrigins.clear();
    mockSent.length = 0;
    mockPcName = 'Office PC';
    useConnectionStore.getState().clearConnection();
    mockVault.set(PC_ID, 'working secret');
    await AsyncStorage.setItem(
        'gaia:paired-pcs',
        JSON.stringify({ pcs: [{ id: PC_ID, name: 'Office PC', origin: 'https://192.168.1.20:4243', deviceId: 'dev-1' }], currentId: PC_ID, pending: null }),
    );
});

describe('re-pairing a PC this phone is already paired with', () => {
    it('keeps the working secret until the PC allows the new one, and keeps it when the PC refuses', async () => {
        const service = createPinnedPairingService();
        mockHealth = 403;
        expect((await service.redeem(invite)).state).toBe('pending');
        expect((await service.status()).state).toBe('pending');
        expect(mockVault.get(PC_ID)).toBe('working secret');

        mockHealth = 401;
        expect((await service.status()).state).toBe('refused');
        expect([...mockVault.entries()]).toEqual([[PC_ID, 'working secret']]);
        expect((await service.list()).map((pc) => pc.connection.baseUrl)).toEqual(['https://192.168.1.20:4243']);
    });

    it('swaps in the new secret and address once the PC allows it', async () => {
        const service = createPinnedPairingService();
        mockHealth = 403;
        await service.redeem(invite);
        mockHealth = 200;
        expect((await service.status()).state).toBe('paired');
        expect([...mockVault.entries()]).toEqual([[PC_ID, 'secret from https://192.168.1.99:4243']]);
        expect((await service.list()).map((pc) => pc.connection.baseUrl)).toEqual(['https://192.168.1.99:4243']);
    });
});

describe("a paired PC's addresses", () => {
    const HOME = 'https://192.168.1.20:4243';

    it('reads a PC saved with one address as its home address', async () => {
        const service = createPinnedPairingService();
        expect(await service.origins(PC_ID)).toEqual([{ kind: 'home', origin: HOME }]);
        expect((await service.list())[0].connection).toMatchObject({ baseUrl: HOME, origins: [HOME] });
    });

    it('keeps the home addresses when the PC has no routes to report', async () => {
        const service = createPinnedPairingService();
        mockRoutes = { status: 404, body: '{"detail":"Not Found"}' };
        expect(await service.refreshRoutes(PC_ID, HOME)).toEqual([{ kind: 'home', origin: HOME }]);
        expect(mockNativeOrigins.size).toBe(0);
    });

    it("saves the PC's valid routes here and natively, and drops any it may not use", async () => {
        const service = createPinnedPairingService();
        const origins = [
            { kind: 'home', origin: 'https://192.168.1.31:4243' },
            { kind: 'tailnet', origin: 'https://100.100.1.2:4243' },
            { kind: 'tailnet', origin: 'https://8.8.8.8:4243' },
            { kind: 'relay', origin: 'https://abcdefghijklmnopqrst234567.relay.example.net' },
        ];
        mockRoutes = { status: 200, body: JSON.stringify({ origins }) };
        const kept = [origins[0], origins[1]];
        expect(await service.refreshRoutes(PC_ID, HOME)).toEqual(kept);
        expect(JSON.parse(mockNativeOrigins.get(PC_ID)!)).toEqual(kept);
        expect(await createPinnedPairingService().origins(PC_ID)).toEqual(kept);
    });
});

describe('a reinstalled app', () => {
    it('wipes the old install\'s secrets once, and leaves them alone after that', async () => {
        await AsyncStorage.removeItem('gaia:paired-pcs');
        const service = createPinnedPairingService();
        expect(await service.restore()).toBeNull();
        expect(mockVault.size).toBe(0);

        mockVault.set(PC_ID, 'paired after the reinstall');
        await createPinnedPairingService().restore();
        expect(mockVault.get(PC_ID)).toBe('paired after the reinstall');
    });

    it('keeps the secrets of an app updated from a build without the marker', async () => {
        await createPinnedPairingService().restore();
        expect(mockVault.get(PC_ID)).toBe('working secret');
    });
});

describe('a second PC with the same name on the same host', () => {
    // The first PC is saved as "air" on port 4243; the second is "air" too, on 4245, with its own id.
    const FIRST_ORIGIN = 'https://192.168.1.20:4243';
    const SECOND_ID = 'b2'.repeat(16);
    const SECOND_ORIGIN = 'https://192.168.1.20:4245';
    const second: PairingInvite = { ...invite, name: 'air', pc_id: SECOND_ID, origins: [SECOND_ORIGIN] };

    async function pairSecond() {
        const raw = JSON.parse((await AsyncStorage.getItem('gaia:paired-pcs'))!);
        raw.pcs[0].name = 'air';
        await AsyncStorage.setItem('gaia:paired-pcs', JSON.stringify(raw));
        mockPcName = 'air';
        const service = createPinnedPairingService();
        useConnectionStore.getState().finishRestore(await service.restore());
        mockHealth = 403;
        await service.redeem(second);
        mockHealth = 200;
        const result = await service.status();
        if (result.state !== 'paired') throw new Error(`pairing ended ${result.state}`);
        // What PairingFlow does with the answer.
        useConnectionStore.getState().setConnection(result.pc.connection);
        return service;
    }

    it('keeps the first PC, its secret and its addresses, and makes the second the one in use', async () => {
        const service = await pairSecond();
        expect((await service.list()).map((pc) => typeof pc.pairedAt)).toEqual(['undefined', 'string']);
        expect(Number.isNaN(Date.parse((await service.list())[1].pairedAt!))).toBe(false);
        const pcs = await service.list();
        expect(pcs.map((pc) => [pc.id, pc.name, pc.connection.baseUrl])).toEqual([
            [PC_ID, 'air', FIRST_ORIGIN],
            [SECOND_ID, 'air', SECOND_ORIGIN],
        ]);
        expect(await service.origins(PC_ID)).toEqual([{ kind: 'home', origin: FIRST_ORIGIN }]);
        expect(mockVault.get(PC_ID)).toBe('working secret');
        expect(mockVault.get(SECOND_ID)).toBe(`secret from ${SECOND_ORIGIN}`);
        expect(useConnectionStore.getState().connection).toMatchObject({ pcId: SECOND_ID, baseUrl: SECOND_ORIGIN });
    });

    // The web build has no pinned transport (fetch.web.ts).
    const itNative = Platform.OS === 'web' ? it.skip : it;

    itNative("switches back to the first, and the app's requests go to it over its own pinned connection", async () => {
        const service = await pairSecond();
        await service.use(PC_ID);
        const { connection } = useConnectionStore.getState();
        expect(connection).toMatchObject({ pcId: PC_ID, baseUrl: FIRST_ORIGIN });

        mockSent.length = 0;
        await platformFetch(`${connection!.baseUrl}/api/health`, {});
        expect(mockSent).toEqual([{ vaultId: PC_ID, url: `${FIRST_ORIGIN}/api/health` }]);
    });

    it('reopens on the PC that was in use, whichever was paired first or last', async () => {
        await pairSecond();
        expect(await createPinnedPairingService().restore()).toMatchObject({ pcId: SECOND_ID, baseUrl: SECOND_ORIGIN });

        await createPinnedPairingService().use(PC_ID);
        const relaunched = createPinnedPairingService();
        expect(await relaunched.restore()).toMatchObject({ pcId: PC_ID, baseUrl: FIRST_ORIGIN });
        expect((await relaunched.list()).map((pc) => pc.id)).toEqual([PC_ID, SECOND_ID]);
    });
});
