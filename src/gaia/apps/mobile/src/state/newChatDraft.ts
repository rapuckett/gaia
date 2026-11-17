// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

// webui's key for the unsent new-chat text (utils/savedDraft.ts), one per paired PC so text typed for one never shows in another's chat.
const newChatDraftKey = (pcId: string) => `gaia:draft:new-chat:${pcId}`;

/** The new-chat text that was typed but never sent for this PC; '' when there is none or no PC is in use. */
export async function readNewChatDraft(pcId: string | null | undefined): Promise<string> {
    if (!pcId) return '';
    try {
        return (await AsyncStorage.getItem(newChatDraftKey(pcId))) ?? '';
    } catch (err) {
        console.warn('Could not read the unsent new-chat draft', err);
        return '';
    }
}

/** Keeps `text` for this PC's next launch; empty text forgets it. Nothing is saved without a PC. */
export function writeNewChatDraft(pcId: string | null | undefined, text: string): void {
    if (!pcId) return;
    const saving = text ? AsyncStorage.setItem(newChatDraftKey(pcId), text) : AsyncStorage.removeItem(newChatDraftKey(pcId));
    saving.catch((err: unknown) => console.warn('Could not save the unsent new-chat draft', err));
}

/** Drops a forgotten PC's draft; resolves once it is gone. */
export function clearNewChatDraft(pcId: string): Promise<void> {
    return AsyncStorage.removeItem(newChatDraftKey(pcId));
}
