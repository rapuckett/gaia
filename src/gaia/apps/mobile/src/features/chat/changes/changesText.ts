// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SessionChanges } from '@/api/client.types';
import type { Translate } from '@/i18n/useT';
import { ref } from '@webui/i18n/registry';

/** "4 files" as a message param, so each language words its own count. */
export const filesRef = (n: number) => ref(n === 1 ? 'chg.files.one' : 'chg.files.other', { n });

/** "4 files changed, +120 −8". */
export function totalText(changes: SessionChanges, t: Translate): string {
    const { files, additions, deletions } = changes.totals;
    return t('chg.total', { files: filesRef(files), add: additions, del: deletions });
}
