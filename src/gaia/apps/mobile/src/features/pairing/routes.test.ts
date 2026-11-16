// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { pickBanner } from '@/features/banners/pickBanner';
import { GaiaNetworkError } from '@/api/errors';
import { translator } from '@/i18n/useT';

import { hasTailnetRoute, routeKindOf } from './routes';

const routes = [
    { kind: 'home' as const, origin: 'https://192.168.1.20:4243' },
    { kind: 'tailnet' as const, origin: 'https://100.101.102.103:4243' },
];

describe('routeKindOf', () => {
    it('names the kind of the address in use', () => {
        expect(routeKindOf({ baseUrl: 'https://192.168.1.20:4243', routes })).toBe('home');
        expect(routeKindOf({ baseUrl: 'https://100.101.102.103:4243', routes })).toBe('tailnet');
        expect(routeKindOf({ baseUrl: 'https://10.0.0.9:4243', routes })).toBeNull();
    });
});

describe('the unreachable hint', () => {
    const t = translator('en');
    const message = (awayHint: boolean) => pickBanner(undefined, new GaiaNetworkError('https://pc', new Error('x')), t, null, { awayHint })?.message;

    it('mentions Tailscale only when a tailnet address is stored', () => {
        expect(hasTailnetRoute({ baseUrl: 'https://192.168.1.20:4243', routes })).toBe(true);
        expect(hasTailnetRoute({ baseUrl: 'https://192.168.1.20:4243', routes: [routes[0]] })).toBe(false);
        expect(message(true)).toBe(t('mobileApp.pairing.unreachable.away'));
        expect(message(false)).toBe(t('mobileApp.pairing.unreachable.body'));
    });
});
