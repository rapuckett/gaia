// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RELAY_ID, routeOrigin, ROUTE_KINDS, TAILNET_NETWORK } from './homeNetwork';

const RELAY = 'relay.example.net';
const ID = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 20) + '234567';

describe('routeOrigin', () => {
    it.each([
        ['home', 'https://192.168.1.20:4243', 'https://192.168.1.20:4243'],
        ['home', 'https://10.0.0.5:4243/', 'https://10.0.0.5:4243'],
        ['tailnet', 'https://100.64.0.1:4243', 'https://100.64.0.1:4243'],
        ['tailnet', 'https://100.127.255.254:4243/', 'https://100.127.255.254:4243'],
        ['relay', `https://${ID}.${RELAY}`, `https://${ID}.${RELAY}`],
        ['relay', `https://${ID}.${RELAY}/`, `https://${ID}.${RELAY}`],
    ])('accepts %s %s', (kind, origin, want) => {
        expect(routeOrigin(kind, origin, RELAY)).toEqual({ kind, origin: want });
    });

    it.each([
        // Each kind accepts only its own addresses.
        ['home', 'https://100.64.0.1:4243'],
        ['tailnet', 'https://192.168.1.20:4243'],
        ['relay', 'https://192.168.1.20:4243'],
        // tailnet: an IPv4 literal in 100.64.0.0/10, with a port, and nothing else.
        ['tailnet', 'https://100.63.255.255:4243'],
        ['tailnet', 'https://100.128.0.1:4243'],
        ['tailnet', 'https://100.64.0.1'],
        ['tailnet', 'http://100.64.0.1:4243'],
        ['tailnet', 'https://100.064.0.1:4243'],
        ['tailnet', 'https://100.64.0.1:4243/api'],
        ['tailnet', 'https://pc.tailnet-name.ts.net:4243'],
        ['tailnet', 'https://[fd7a:115c:a1e0::1]:4243'],
        // relay: a 26-character base32 id under the built-in domain, on 443.
        ['relay', `https://${ID}.${RELAY}:443`],
        ['relay', `https://${ID}.${RELAY}:8443`],
        ['relay', `http://${ID}.${RELAY}`],
        ['relay', `https://${ID.slice(1)}.${RELAY}`],
        ['relay', `https://${ID}a.${RELAY}`],
        ['relay', `https://${ID.toUpperCase()}.${RELAY}`],
        ['relay', `https://${ID.slice(1)}1.${RELAY}`],
        ['relay', `https://${ID}.evil.${RELAY}`],
        ['relay', `https://${ID}.${RELAY}.evil.com`],
        ['relay', `https://${ID}.other.example.net`],
        ['relay', `https://user@${ID}.${RELAY}`],
        ['relay', `https://${ID}.${RELAY}/path`],
        ['relay', `https://${ID}.${RELAY}?x=1`],
        // Unknown kinds and shapes.
        ['vpn', 'https://192.168.1.20:4243'],
        [undefined, 'https://192.168.1.20:4243'],
        ['home', 42],
    ])('refuses %s %s', (kind, origin) => {
        expect(routeOrigin(kind, origin, RELAY)).toBeNull();
    });

    it('refuses every relay origin when the build has no relay domain', () => {
        expect(routeOrigin('relay', `https://${ID}.${RELAY}`, undefined)).toBeNull();
        expect(routeOrigin('relay', `https://${ID}.${RELAY}`, '')).toBeNull();
    });
});

describe('the native transport', () => {
    const mobile = join(__dirname, '../../..');
    const swift = readFileSync(join(mobile, 'modules/gaia-transport/ios/HomeNetwork.swift'), 'utf-8');

    it('checks the same route kinds, tailnet range and relay id', () => {
        const kinds = [...swift.matchAll(/^ {2}case "(\w+)": return/gm)].map((m) => m[1]);
        expect(kinds).toEqual([...ROUTE_KINDS]);
        expect(/^private let tailnetNetwork = "([\d./]+)"/m.exec(swift)?.[1]).toBe(TAILNET_NETWORK);
        const length = Number(/^private let relayIdLength = (\d+)/m.exec(swift)?.[1]);
        const alphabet = /^private let relayIdAlphabet = "([a-z0-9]+)"/m.exec(swift)?.[1] ?? '';
        expect(RELAY_ID.source).toBe(`^[${alphabet[0]}-${alphabet[25]}${alphabet[26]}-${alphabet[31]}]{${length}}$`);
        expect(alphabet).toBe('abcdefghijklmnopqrstuvwxyz234567');
    });

    it('reads the relay domain from the Info.plist key app.config writes', () => {
        const key = /^private let relayDomainKey = "(\w+)"/m.exec(swift)?.[1];
        const config = readFileSync(join(mobile, 'app.config.ts'), 'utf-8');
        expect(config).toContain(`{ ${key}: relayDomain }`);
        expect(config).toContain('process.env.EXPO_PUBLIC_GAIA_RELAY_DOMAIN');
    });
});
