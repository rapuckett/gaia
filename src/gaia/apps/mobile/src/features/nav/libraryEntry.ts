// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

/** A browser or preview linked cold has a chat-less Documents beneath it; give that page the link's chat. */
export function useLibraryAnchorChat(chat: string | undefined): void {
    const navigation = useNavigation();
    useEffect(() => {
        if (!chat) return;
        const first = navigation.getState()?.routes[0];
        if (first?.name !== 'documents' || (first.params as { chat?: string } | undefined)?.chat) return;
        navigation.dispatch({ type: 'SET_PARAMS', payload: { params: { chat } }, source: first.key });
    }, [navigation, chat]);
}

export interface LibraryNavigator {
    navigate(href: { pathname: '/documents'; params: { chat?: string } }): void;
}

/** Enter the library from anywhere: one Documents page, for `chat` when given. */
export function openLibrary(router: LibraryNavigator, chat?: string): void {
    router.navigate({ pathname: '/documents', params: { chat } });
}
