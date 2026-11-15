// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { parseOffer } from './parseOffer';
import { PairingError } from './pairing.types';

const NOW = 1_794_700_000_000;
const OFFER = {
    v: 1,
    name: 'Studio PC',
    pc_id: 'pc-1',
    origins: ['https://192.168.1.20:4243'],
    pin: 'a'.repeat(64),
    invite: 'AbCdEfGhIjKlMnOpQrStUv',
    exp: NOW / 1000 + 600,
};

function codeOf(text: string): string {
    try {
        parseOffer(text, NOW);
    } catch (err) {
        if (err instanceof PairingError) return err.code;
        throw err;
    }
    return 'accepted';
}

describe('parseOffer', () => {
    it('reads the PC QR code', () => {
        expect(parseOffer(` ${JSON.stringify(OFFER)}\n`, NOW)).toEqual(OFFER);
    });

    it('refuses an expired code before any request', () => {
        expect(codeOf(JSON.stringify({ ...OFFER, exp: NOW / 1000 }))).toBe('expired');
    });

    it.each([
        ['another version', JSON.stringify({ ...OFFER, v: 2 })],
        ['a public address', JSON.stringify({ ...OFFER, origins: ['https://8.8.8.8:4243'] })],
        ['plain http', JSON.stringify({ ...OFFER, origins: ['http://192.168.1.20:4243'] })],
        ['a short pin', JSON.stringify({ ...OFFER, pin: 'abc' })],
        ['garbage', 'not a code'],
        ['a JSON array', '[1]'],
    ])('refuses %s as invalid', (_label, text) => {
        expect(codeOf(text)).toBe('invalid_code');
    });
});
