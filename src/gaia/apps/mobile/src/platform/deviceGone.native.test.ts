// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { GaiaAuthError } from '@/api/errors';
import { createHttpClient } from '@/api/http';
import { useConnectionStore } from '@/state/connection';

import { GaiaTransport } from '../../modules/gaia-transport';
import { platformFetch } from './fetch';
import { onDeviceGone } from './pinnedFetch';

jest.mock('../../modules/gaia-transport', () => ({
    GaiaTransport: { start: jest.fn(), read: jest.fn(), cancel: jest.fn(), addListener: jest.fn() },
    transportAvailable: true,
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn(() => Promise.reject(new Error('unpinned fetch used'))) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const BASE = 'https://192.168.1.20:4443';
const native = jest.mocked(GaiaTransport);
const gone = jest.fn();

function answer(status: number, headers: Record<string, string>, body: unknown): void {
    native.start.mockResolvedValue({ status, headers });
    native.read.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(body))).mockResolvedValueOnce(null);
}

describeNative('a 401 from the paired PC', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        native.read.mockReset();
        useConnectionStore.getState().setConnection({ baseUrl: BASE, pcId: 'pc-1', pinned: true });
        onDeviceGone(gone);
    });
    afterEach(() => onDeviceGone(null));

    const health = () => createHttpClient({ baseUrl: BASE, token: null, fetch: platformFetch }).health();

    it("drops the pairing for the device gate's refusal, and the caller still reads its body", async () => {
        answer(401, { 'www-authenticate': 'Bearer realm="gaia"' }, { detail: 'Pair again.', code: 'device_unknown' });
        const err = await health().catch((e: unknown) => e);
        expect(gone).toHaveBeenCalledWith('pc-1');
        expect(err).toBeInstanceOf(GaiaAuthError);
        expect((err as GaiaAuthError).message).toContain('Pair again.');
    });

    it.each([
        ['no code', { detail: 'Not authenticated' }],
        ['another code', { detail: 'Nope', code: 'token_expired' }],
    ])('keeps the pairing for a Bearer 401 from other middleware (%s) and surfaces a normal auth error', async (_name, body) => {
        answer(401, { 'www-authenticate': 'Bearer' }, body);
        const err = await health().catch((e: unknown) => e);
        expect(gone).not.toHaveBeenCalled();
        expect(useConnectionStore.getState().connection?.pcId).toBe('pc-1');
        expect(err).toBeInstanceOf(GaiaAuthError);
        expect((err as GaiaAuthError).message).toContain(String(body.detail));
    });

    it('leaves a 401 without the Bearer header alone, body included', async () => {
        answer(401, {}, { detail: 'Basic only', code: 'device_unknown' });
        const err = await health().catch((e: unknown) => e);
        expect(gone).not.toHaveBeenCalled();
        expect(err).toBeInstanceOf(GaiaAuthError);
        expect((err as GaiaAuthError).message).toContain('Basic only');
    });

    it('hands the buffered body back as a stream too', async () => {
        answer(401, { 'www-authenticate': 'Bearer' }, { code: 'device_unknown' });
        const res = await platformFetch(`${BASE}/api/health`, {});
        const chunks: Uint8Array[] = [];
        const reader = res.body!.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        expect(new TextDecoder().decode(chunks[0])).toBe('{"code":"device_unknown"}');
    });
});
