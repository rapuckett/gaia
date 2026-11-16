// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { createHttpClient } from '@/api/http';
import { useConnectionStore } from '@/state/connection';

import { platformFetch } from './fetch';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../modules/gaia-transport', () => ({ GaiaTransport: {}, transportAvailable: false }));
jest.mock('expo-file-system', () => ({
    File: function File(this: { uri: string; type: string; bytes(): Promise<Uint8Array> }, uri: string) {
        this.uri = uri;
        this.type = 'image/jpeg';
        this.bytes = async () => new TextEncoder().encode('JPEGDATA');
    },
    Paths: {},
}));

// The phone's FormData (React Native's, with Expo's patch), not Node's, which only takes Blobs.
const nodeFormData = globalThis.FormData;
beforeAll(() => {
    const phoneFormData = jest.requireActual('react-native/Libraries/Network/FormData').default;
    jest.requireActual('expo/src/winter/FormData').installFormDataPatch(phoneFormData);
    globalThis.FormData = phoneFormData;
});
afterAll(() => {
    globalThis.FormData = nodeFormData;
});

// Web has its own fetch.web.ts; this is the native module.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('an upload over the dev build’s plain fetch', () => {
    it('sends the picked name as UTF-8, as the pinned transport and a browser do', async () => {
        const BASE = 'http://127.0.0.1:4212';
        useConnectionStore.getState().setConnection({ baseUrl: BASE });
        const reply = JSON.stringify({ filename: 'attachment.jpg', url: '/api/files/uploads/attachment.jpg' });
        jest.mocked(expoFetch).mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, body: null, text: async () => reply } as never);
        const { File } = jest.requireMock('expo-file-system');

        const client = createHttpClient({ baseUrl: BASE, token: null, fetch: platformFetch });
        await client.uploadFile(new File('file:///var/mobile/tmp/ABC.jpg'), 'صورة الإيصال.jpg');

        const [, init] = jest.mocked(expoFetch).mock.calls[0]!;
        const boundary = /^multipart\/form-data; boundary=(\S+)$/.exec(init?.headers ? (init.headers as Record<string, string>)['Content-Type'] ?? '' : '')?.[1];
        expect(boundary).toBeTruthy();
        expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="صورة الإيصال.jpg"\r\n` +
                `Content-Type: image/jpeg\r\n\r\nJPEGDATA\r\n--${boundary}--\r\n`,
        );
    });
});
