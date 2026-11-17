// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

// webui's key for the unsent new-chat text (utils/savedDraft.ts: prefix + NEW_CHAT_DRAFT_KEY).
const NEW_CHAT_DRAFT_KEY = 'gaia:draft:new-chat';

/** The new-chat text that was typed but never sent; '' when there is none. */
export async function readNewChatDraft(): Promise<string> {
    try {
        return (await AsyncStorage.getItem(NEW_CHAT_DRAFT_KEY)) ?? '';
    } catch (err) {
        console.warn('Could not read the unsent new-chat draft', err);
        return '';
    }
}

/** Keeps `text` for the next launch; empty text forgets the draft. */
export function writeNewChatDraft(text: string): void {
    const saving = text ? AsyncStorage.setItem(NEW_CHAT_DRAFT_KEY, text) : AsyncStorage.removeItem(NEW_CHAT_DRAFT_KEY);
    saving.catch((err: unknown) => console.warn('Could not save the unsent new-chat draft', err));
}
