// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';

import { translator } from '@webui/i18n/translator';

import { quickActions, type QuickActionItem } from '../../../modules/gaia-quick-actions';
import { openNewChat, type Navigator } from './navigation';

/** The desktop tray's New chat, on the phone's app icon. */
export const NEW_CHAT_ACTION = 'new-chat';

/** The icon's actions in the app's language: the drawer's New chat label, without the English brackets, like the app's other system text. */
export function quickActionItems(locale: string): QuickActionItem[] {
    return [{ id: NEW_CHAT_ACTION, title: translator(locale).bare('sidebar.newChat') }];
}

export function runQuickAction(id: string, router: Navigator): void {
    if (id === NEW_CHAT_ACTION) openNewChat(router);
    else console.error(`The app icon sent quick action "${id}", which this version of GAIA doesn't have.`);
}

/** Puts the icon's actions in the app's language, again whenever it changes. */
export function useQuickActionItems(locale: string | null): void {
    useEffect(() => {
        const native = quickActions();
        if (!native || !locale) return;
        native.setItems(quickActionItems(locale)).catch((error: unknown) => {
            console.error('Could not set the actions on the app icon', error);
        });
    }, [locale]);
}

/** Opens what the icon's action asks for: the one that started the app once, then each one chosen while it runs. */
export function useQuickActionRouting(router: Navigator): void {
    useEffect(() => {
        const native = quickActions();
        if (!native) return;
        // Listen first, then take what came before, so an action between the two isn't lost.
        const sub = native.addListener('onAction', ({ id }) => runQuickAction(id, router));
        const pending = native.takePending();
        if (pending) runQuickAction(pending, router);
        return () => sub.remove();
    }, [router]);
}
