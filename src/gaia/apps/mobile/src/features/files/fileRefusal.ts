// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GaiaApiError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';

const REFUSAL_KEYS = {
    credentials_withheld: 'mobileApp.files.refused.credentialsWithheld',
    document_not_in_chat: 'mobileApp.files.refused.documentNotInChat',
    no_chat_folders: 'mobileApp.files.refused.noChatFolders',
    not_in_chat_folders: 'mobileApp.files.refused.notInChatFolders',
    session_required: 'mobileApp.files.refused.sessionRequired',
} as const;

/** True when the PC refused the file or folder with one of the codes this app words itself. */
export function isFileRefusal(error: unknown): error is GaiaApiError {
    const code = (error as GaiaApiError | null)?.body?.code;
    return typeof code === 'string' && code in REFUSAL_KEYS;
}

/** The PC's file refusal in the app's language; its own sentence when the code is one this app lacks. */
export function fileRefusalText(error: GaiaApiError, t: Translate): string {
    const code = error.body?.code;
    if (typeof code !== 'string' || !(code in REFUSAL_KEYS)) return error.detail;
    const name = error.body?.name;
    return t(REFUSAL_KEYS[code as keyof typeof REFUSAL_KEYS], typeof name === 'string' ? { name } : {});
}
