// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FetchRequestInit } from '@/platform/fetch.types';

import { createPcPushClient, PUSH_SELF_ROUTE } from './pcPushClient';
import { createRelayClient, RelayRequestError, RelayUnauthorizedError, RelayUnreachableError } from './relayClient';

function fakeFetch(status: number, body = '') {
    const calls: { url: string; init?: FetchRequestInit }[] = [];
    const fetch = jest.fn(async (url: string, init?: FetchRequestInit) => {
        calls.push({ url, init });
        return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, body: null, text: async () => body };
    });
    return { fetch, calls };
}

const H = { handle: 'AAAAAAAAAAAAAAAAAAAAAA', secret: 'test-secret' };

describe('the relay client sends what the relay accepts', () => {
    it('registers with a JSON body and reads handle, secret and send token', async () => {
        const { fetch, calls } = fakeFetch(201, JSON.stringify({ handle: H.handle, secret: 's', send_token: 't' }));
        const relay = createRelayClient('https://relay.example', fetch);
        await expect(relay.register({ platform: 'fcm', token: 'tok', app_id: 'com.example', environment: 'production' })).resolves.toEqual({ handle: H.handle, secret: 's', sendToken: 't' });
        expect(calls[0].url).toBe('https://relay.example/v1/handles');
        expect(calls[0].init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
        expect(JSON.parse(String(calls[0].init?.body))).toEqual({ platform: 'fcm', token: 'tok', app_id: 'com.example', environment: 'production' });
    });

    it('refuses an answer without a send token', async () => {
        const { fetch } = fakeFetch(201, JSON.stringify({ handle: H.handle, secret: 's' }));
        await expect(createRelayClient('https://relay.example', fetch).register({ platform: 'apns', token: 't', app_id: 'a.b', environment: 'sandbox' })).rejects.toBeInstanceOf(RelayRequestError);
    });

    it('rotates the token and deletes with the phone secret as the bearer', async () => {
        const { fetch, calls } = fakeFetch(204);
        const relay = createRelayClient('https://relay.example', fetch);
        await relay.updateToken(H, 'tok-2');
        await relay.remove(H);
        expect(calls[0]).toEqual({ url: `https://relay.example/v1/handles/${H.handle}`, init: { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' }, body: '{"token":"tok-2"}' } });
        expect(calls[1]).toEqual({ url: `https://relay.example/v1/handles/${H.handle}`, init: { method: 'DELETE', headers: { Authorization: 'Bearer test-secret' } } });
    });

    it('sorts 401, 429 and 5xx, and a network failure', async () => {
        await expect(createRelayClient('https://r', fakeFetch(401).fetch).updateToken(H, 't')).rejects.toBeInstanceOf(RelayUnauthorizedError);
        await expect(createRelayClient('https://r', fakeFetch(429).fetch).updateToken(H, 't')).rejects.toBeInstanceOf(RelayUnreachableError);
        await expect(createRelayClient('https://r', fakeFetch(502).fetch).updateToken(H, 't')).rejects.toBeInstanceOf(RelayUnreachableError);
        await expect(createRelayClient('https://r', fakeFetch(400, '{"error":"bad_app_id"}').fetch).updateToken(H, 't')).rejects.toMatchObject({ code: 'bad_app_id' });
        const down = jest.fn(async () => {
            throw new Error('offline');
        });
        await expect(createRelayClient('https://r', down).remove(H)).rejects.toBeInstanceOf(RelayUnreachableError);
    });
});

describe("the PC push client uses this device's own route", () => {
    it('PUTs the record, reads the status and DELETEs', async () => {
        const { fetch, calls } = fakeFetch(200, JSON.stringify({ enabled: true, relay_host: 'relay.example' }));
        const pc = createPcPushClient('https://pc.local:4243', fetch);
        await pc.put({ relay_url: 'https://relay.example', handle: H.handle, send_token: 't', key: 'k', platform: 'apns' });
        await expect(pc.get()).resolves.toEqual({ enabled: true, relay_host: 'relay.example' });
        await pc.remove();
        expect(calls.map((c) => [c.init?.method, c.url])).toEqual([
            ['PUT', `https://pc.local:4243${PUSH_SELF_ROUTE}`],
            ['GET', `https://pc.local:4243${PUSH_SELF_ROUTE}`],
            ['DELETE', `https://pc.local:4243${PUSH_SELF_ROUTE}`],
        ]);
        expect(calls[0].init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Gaia-UI': '1' });
    });
});
