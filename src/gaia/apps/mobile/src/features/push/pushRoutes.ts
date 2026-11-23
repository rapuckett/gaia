// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The same allow-list as the native code that words the notification (PushMessage.swift, PushMessage.kt).
const ID = '[A-Za-z0-9_-]{1,128}';
const CHAT = new RegExp(`^/chat/${ID}$`);
const APPROVAL = new RegExp(`^/approvals/${ID}$`);
const SESSION = new RegExp(`^${ID}$`);

/** Where a tapped notification may go: a chat, an approval (opened as its chat, whose newest turn holds the card), or home. */
export function safePushRoute(route: unknown, sessionId?: unknown): string {
    if (typeof route !== 'string') return '/';
    if (CHAT.test(route)) return route;
    if (APPROVAL.test(route) && typeof sessionId === 'string' && SESSION.test(sessionId)) return `/chat/${sessionId}`;
    return '/';
}

/** Android's tapped notification opens `<scheme>://push?route=…`; this is its route, checked again, or null for any other link. */
export function pushLinkRoute(link: string): string | null {
    const match = /^(?:[a-z][a-z0-9+.-]*:)?\/*push\/?\?(.*)$/i.exec(link);
    if (!match) return null;
    let route: string | null = null;
    for (const part of match[1].split('&')) {
        const [name, value = ''] = part.split('=');
        if (name !== 'route') continue;
        try {
            route = decodeURIComponent(value.replace(/\+/g, ' '));
        } catch {
            return '/';
        }
    }
    return safePushRoute(route);
}

/** The route in a tapped iOS notification: the extension writes it to the data expo-notifications reports. */
export function notificationRoute(data: unknown): string {
    const route = data && typeof data === 'object' ? (data as { route?: unknown }).route : undefined;
    return safePushRoute(route);
}
