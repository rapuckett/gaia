// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PairingInvite } from './invite';
import { createPinnedPairingService } from './pinnedPairingService';

const mockVault = new Map<string, string>();
const mockNativeOrigins = new Map<string, string>();
let mockHealth = 403;
let mockRoutes: { status: number; body: string } = { status: 404, body: '{"detail":"Not Found"}' };

jest.mock('expo-device', () => ({ deviceName: 'Test phone', modelName: 'iPhone' }));
jest.mock('../../../modules/gaia-transport', () => ({
    transportAvailable: true,
    GaiaTransport: {
        pair: async (vaultId: string, origins: string[]) => {
            mockVault.set(vaultId, `secret from ${origins[0]}`);
            return { status: 200, origin: origins[0], body: JSON.stringify({ device_id: 'dev-2', pc_name: 'Office PC' }) };
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
    pinnedFetch: async (vaultId: string, url: string) => {
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
