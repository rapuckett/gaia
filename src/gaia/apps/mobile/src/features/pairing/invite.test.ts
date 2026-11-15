// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { parseInvite, PairingInviteError, type PairingInvite } from './invite';

const NOW = 1_800_000_000;
const offer: PairingInvite = {
    v: 1,
    name: 'Office PC',
    pc_id: 'pc-1',
    origins: ['https://192.168.1.20:4243'],
    pin: 'AB'.repeat(32),
    invite: 'abc123_-xyz',
    exp: NOW + 600,
};
const json = JSON.stringify(offer);
const b64url = Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const keyOf = (fn: () => unknown) => {
    try {
        fn();
    } catch (e) {
        if (e instanceof PairingInviteError) return e.messageKey;
        throw e;
    }
    return null;
};

describe('parseInvite', () => {
    it('reads the QR payload, a link carrying it, or its base64url form, into the same shape', () => {
        const want = { ...offer, pin: offer.pin.toLowerCase() };
        expect(parseInvite(json, NOW)).toEqual(want);
        expect(parseInvite(`  ${json}\n`, NOW)).toEqual(want);
        expect(parseInvite(`gaia://pair?offer=${encodeURIComponent(json)}`, NOW)).toEqual(want);
        expect(parseInvite(`https://pc.example/pair#${b64url}`, NOW)).toEqual(want);
        expect(parseInvite(b64url, NOW)).toEqual(want);
    });

    it('refuses what it cannot use with the message that says what to do', () => {
        expect(keyOf(() => parseInvite('  ', NOW))).toBe('mobileApp.pairing.invite.empty');
        expect(keyOf(() => parseInvite('hello there', NOW))).toBe('mobileApp.pairing.invite.unreadable');
        expect(keyOf(() => parseInvite(JSON.stringify({ ...offer, v: 2 }), NOW))).toBe('mobileApp.pairing.invite.version');
        expect(keyOf(() => parseInvite(JSON.stringify({ ...offer, pin: 'abc' }), NOW))).toBe('mobileApp.pairing.invite.incomplete');
        expect(keyOf(() => parseInvite(JSON.stringify({ ...offer, origins: [] }), NOW))).toBe('mobileApp.pairing.invite.incomplete');
        expect(keyOf(() => parseInvite(JSON.stringify({ ...offer, origins: ['http://192.168.1.20:4243'] }), NOW))).toBe('mobileApp.pairing.invite.badAddress');
        expect(keyOf(() => parseInvite(JSON.stringify({ ...offer, exp: NOW - 1 }), NOW))).toBe('mobileApp.pairing.invite.expired');
    });
});
