// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * The push payload's encryption, which the PC (encrypting) and the phone (decrypting, in the iOS
 * extension's PushCrypto.swift and Android's PushCrypto.kt) must agree on byte for byte:
 *
 * - key:    32 random bytes, made by the phone per paired PC; sent to the PC as base64url without padding.
 * - cipher: AES-256-GCM, 16-byte tag, a fresh random 12-byte nonce per message.
 * - AAD:    the UTF-8 bytes of the handle exactly as the relay returned it (its base64url text, not the
 *           decoded 16 bytes), followed by one byte holding the payload version, 0x01.
 * - plain:  UTF-8 JSON `{v:1, kind, params:{chat_title?, summary?, label?, ask?}, route, session_id?, approval_id?, badge, ts, seq}`,
 *           right-padded with ASCII spaces (0x20) to the smallest of 256, 512, 1024 or 2048 bytes that fits; more than
 *           2048 is the PC's error to fix (drop `summary`), never sent unpadded. The phone trims the spaces before parsing.
 *           `ts` is unix milliseconds, for display only. `seq` is the PC's per-device counter, strictly increasing
 *           (about 1.8e12: the PC uses max(stored + 1, now in ms)); the phone rejects a payload whose `seq` isn't above
 *           the last one it accepted under that PC's key, and a newly registered key accepts any first `seq`.
 * - wire:   `nonce` = base64url(12-byte nonce); `ciphertext` = base64url(ciphertext || 16-byte tag), no padding.
 *           The relay forwards them as APNs custom keys or FCM data `{c: ciphertext, n: nonce}`.
 *
 * Here for tests and fixtures; the phone app itself only makes keys (newPushKey) and never decrypts in JavaScript.
 */

export const PUSH_PAYLOAD_VERSION = 1;
export const PUSH_KEY_BYTES = 32;
export const PUSH_NONCE_BYTES = 12;
export const PUSH_PAD_BUCKETS = [256, 512, 1024, 2048] as const;

/** The PC's padding: the JSON's UTF-8 bytes, spaces to the smallest bucket that fits. */
export function padPlaintext(json: string): Uint8Array {
    const bytes = new TextEncoder().encode(json);
    const size = PUSH_PAD_BUCKETS.find((b) => b >= bytes.length);
    if (size === undefined) throw new Error(`A push payload of ${bytes.length} bytes is over ${PUSH_PAD_BUCKETS.at(-1)}; drop its summary.`);
    const out = new Uint8Array(size).fill(0x20);
    out.set(bytes);
    return out;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
        for (let c = 0; c < chars; c++) out += ALPHABET[(n >> (18 - 6 * c)) & 63];
    }
    return out;
}

export function fromBase64Url(text: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Not unpadded base64url text.');
    const out = new Uint8Array(Math.floor((text.length * 6) / 8));
    let bits = 0;
    let acc = 0;
    let o = 0;
    for (const ch of text) {
        acc = (acc << 6) | ALPHABET.indexOf(ch);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[o++] = (acc >> bits) & 0xff;
        }
    }
    return out;
}

export function pushAad(handle: string): Uint8Array {
    const text = new TextEncoder().encode(handle);
    const aad = new Uint8Array(text.length + 1);
    aad.set(text);
    aad[text.length] = PUSH_PAYLOAD_VERSION;
    return aad;
}

/** A new payload key for one paired PC, as base64url; `random` is the platform's CSPRNG (expo-crypto's getRandomBytes). */
export function newPushKey(random: (n: number) => Uint8Array): string {
    const bytes = random(PUSH_KEY_BYTES);
    if (bytes.length !== PUSH_KEY_BYTES) throw new Error(`The random source gave ${bytes.length} bytes for a push key, not ${PUSH_KEY_BYTES}.`);
    return toBase64Url(bytes);
}

export interface SealedPush {
    ciphertext: string;
    nonce: string;
}

async function importKey(subtle: SubtleCrypto, key: string, usage: KeyUsage): Promise<CryptoKey> {
    const raw = fromBase64Url(key);
    if (raw.length !== PUSH_KEY_BYTES) throw new Error(`A push key is ${PUSH_KEY_BYTES} bytes, not ${raw.length}.`);
    return subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [usage]);
}

/** What the PC does: pad and seal `payload` for one handle. `nonce` is for fixed test vectors only; omit it otherwise. */
export async function sealPush(
    subtle: SubtleCrypto,
    { key, handle, payload, nonce }: { key: string; handle: string; payload: unknown; nonce?: Uint8Array },
): Promise<SealedPush> {
    const iv = nonce ?? crypto.getRandomValues(new Uint8Array(PUSH_NONCE_BYTES));
    if (iv.length !== PUSH_NONCE_BYTES) throw new Error(`A push nonce is ${PUSH_NONCE_BYTES} bytes, not ${iv.length}.`);
    const plain = padPlaintext(JSON.stringify(payload));
    const sealed = await subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: pushAad(handle) as BufferSource, tagLength: 128 },
        await importKey(subtle, key, 'encrypt'),
        plain as BufferSource,
    );
    return { ciphertext: toBase64Url(new Uint8Array(sealed)), nonce: toBase64Url(iv) };
}

/** What the phone's native code does: open a sealed push. Throws on a wrong key, handle or tampered byte. */
export async function openPush(subtle: SubtleCrypto, { key, handle, sealed }: { key: string; handle: string; sealed: SealedPush }): Promise<unknown> {
    const iv = fromBase64Url(sealed.nonce);
    if (iv.length !== PUSH_NONCE_BYTES) throw new Error(`A push nonce is ${PUSH_NONCE_BYTES} bytes, not ${iv.length}.`);
    const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: pushAad(handle) as BufferSource, tagLength: 128 },
        await importKey(subtle, key, 'decrypt'),
        fromBase64Url(sealed.ciphertext) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain).replace(/ +$/, ''));
}
