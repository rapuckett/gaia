// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createCipheriv, webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import vector from './__fixtures__/push-vector.json';
import { fromBase64Url, newPushKey, openPush, pushAad, sealPush, toBase64Url } from './pushCrypto';

// Hermes has both; the web project's jsdom doesn't.
Object.assign(globalThis, { TextEncoder: globalThis.TextEncoder ?? TextEncoder, TextDecoder: globalThis.TextDecoder ?? TextDecoder });

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const nonce = fromBase64Url(vector.nonce);
const payload = JSON.parse(vector.plaintext) as unknown;

describe('push payload crypto', () => {
    it('round-trips base64url for every length mod 3', () => {
        for (let n = 0; n < 40; n++) {
            const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
            expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
            expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
        }
        expect(() => fromBase64Url('abc=')).toThrow(/base64url/);
    });

    it('binds the handle and version 1 as the AAD', () => {
        expect(Buffer.from(pushAad(vector.handle)).toString('hex')).toBe(vector.aad_hex);
        expect(pushAad('h').at(-1)).toBe(1);
    });

    it('matches the committed vector, which an independent AES-GCM produces too', async () => {
        const sealed = await sealPush(subtle, { key: vector.key, handle: vector.handle, payload, nonce });
        expect(sealed).toEqual({ ciphertext: vector.ciphertext, nonce: vector.nonce });

        const cipher = createCipheriv('aes-256-gcm', fromBase64Url(vector.key), nonce);
        cipher.setAAD(pushAad(vector.handle));
        const node = Buffer.concat([cipher.update(vector.plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
        expect(node.toString('base64url')).toBe(vector.ciphertext);

        await expect(openPush(subtle, { key: vector.key, handle: vector.handle, sealed })).resolves.toEqual(payload);
    });

    it('refuses another handle, another key or a changed byte', async () => {
        const sealed = { ciphertext: vector.ciphertext, nonce: vector.nonce };
        await expect(openPush(subtle, { key: vector.key, handle: `${vector.handle}x`, sealed })).rejects.toThrow();
        const otherKey = toBase64Url(new Uint8Array(32).fill(7));
        await expect(openPush(subtle, { key: otherKey, handle: vector.handle, sealed })).rejects.toThrow();
        const bytes = fromBase64Url(vector.ciphertext);
        bytes[3] ^= 1;
        await expect(openPush(subtle, { key: vector.key, handle: vector.handle, sealed: { ...sealed, ciphertext: toBase64Url(bytes) } })).rejects.toThrow();
    });

    it('makes a 32-byte key and refuses a short random source', () => {
        expect(fromBase64Url(newPushKey((n) => new Uint8Array(n).fill(1)))).toHaveLength(32);
        expect(() => newPushKey(() => new Uint8Array(16))).toThrow(/16 bytes/);
    });
});
