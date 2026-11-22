// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';

const FOLDER_REFUSAL_KEYS = {
    device_folder_outside_home: 'mobileApp.folder.refused.outsideHome',
    device_folder_withheld: 'mobileApp.folder.refused.withheld',
} as const;

type FolderRefusalCode = keyof typeof FOLDER_REFUSAL_KEYS;

function isFolderRefusalCode(code: unknown): code is FolderRefusalCode {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(FOLDER_REFUSAL_KEYS, code);
}

/** True for the PC refusing this phone a folder, with a code this app words itself. */
export function isFolderRefusal(error: unknown): error is GaiaApiError {
    return error instanceof GaiaApiError && error.status === 403 && isFolderRefusalCode(error.body?.code);
}

/** The PC's folder refusal as this app's sentence, with the PC's own words for the detail line; null for any other failure. */
export function folderRefusalNotice(error: unknown, t: Translate): { text: string; detail?: string } | null {
    if (!isFolderRefusal(error)) return null;
    return { text: t(FOLDER_REFUSAL_KEYS[error.body?.code as FolderRefusalCode]), detail: error.detail || undefined };
}
