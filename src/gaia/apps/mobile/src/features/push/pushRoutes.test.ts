// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { redirectSystemPath } from '@/app/+native-intent';

import { notificationRoute, pushLinkRoute, safePushRoute } from './pushRoutes';

describe('push route allow-list', () => {
    it('opens a chat, an approval as its chat, or home', () => {
        expect(safePushRoute('/chat/abc-123')).toBe('/chat/abc-123');
        expect(safePushRoute('/approvals/ap_1', 's_42')).toBe('/chat/s_42');
        expect(safePushRoute('/')).toBe('/');
    });

    it('opens home for anything else', () => {
        for (const route of ['/settings', '/chat/', '/chat/a/b', '/chat/a?x=1', '//evil.example/chat/a', 'https://evil.example', '/chat/a%2F..', '/approvals/ap_1', null, 42]) {
            expect(safePushRoute(route)).toBe('/');
        }
        expect(safePushRoute('/approvals/ap_1', '../x')).toBe('/');
    });

    it("reads the iOS extension's data and Android's push link", () => {
        expect(notificationRoute({ route: '/chat/s1' })).toBe('/chat/s1');
        expect(notificationRoute({ route: '/logs' })).toBe('/');
        expect(notificationRoute(undefined)).toBe('/');
        expect(pushLinkRoute('ai.amd.gaia.mobile://push?route=%2Fchat%2Fs1')).toBe('/chat/s1');
        expect(pushLinkRoute('ai.amd.gaia.mobile://push?route=%2Fsettings')).toBe('/');
        expect(pushLinkRoute('ai.amd.gaia.mobile://push?route=%E0%A4%A')).toBe('/');
        expect(pushLinkRoute('ai.amd.gaia.mobile://chat/s1')).toBeNull();
    });

    it('routes a push link through the app intent, and leaves other links alone', () => {
        expect(redirectSystemPath({ path: 'ai.amd.gaia.mobile://push?route=%2Fchat%2Fs1', initial: true })).toBe('/chat/s1');
        expect(redirectSystemPath({ path: '/chat/s1', initial: false })).toBe('/chat/s1');
    });
});
