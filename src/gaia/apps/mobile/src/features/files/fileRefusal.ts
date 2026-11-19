// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GaiaApiError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';

const REFUSAL_KEYS = {
    credentials_withheld: 'mobileApp.files.refused.credentialsWithheld',
    document_not_in_chat: 'mobileApp.files.refused.documentNotInChat',
    no_chat_folders: 'mobileApp.files.refused.noChatFolders',
    not_in_chat_folders: 'mobileApp.files.refused.notInChatFolders',
    outside_home: 'mobileApp.files.refused.outsideHome',
    session_required: 'mobileApp.files.refused.sessionRequired',
} as const;

/** True for a 403 carrying a refusal code, one this app words itself or not. */
export function isFileRefusal(error: unknown): error is GaiaApiError {
    const e = error as GaiaApiError | null;
    return e?.status === 403 && typeof e.body?.code === 'string';
}

/** True when the refusal's code is one this app words itself. */
export function isKnownRefusalCode(error: GaiaApiError): boolean {
    return typeof error.body?.code === 'string' && error.body.code in REFUSAL_KEYS;
}

/** The PC's file refusal in the app's language; its own sentence when the code is one this app lacks. */
export function fileRefusalText(error: GaiaApiError, t: Translate): string {
    const code = error.body?.code;
    if (typeof code !== 'string' || !(code in REFUSAL_KEYS)) return error.detail;
    const name = error.body?.name;
    return t(REFUSAL_KEYS[code as keyof typeof REFUSAL_KEYS], typeof name === 'string' ? { name } : {});
}
