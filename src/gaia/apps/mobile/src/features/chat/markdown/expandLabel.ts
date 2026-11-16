// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { pluralKey, ref } from '@webui/i18n/registry';
import type { Translate } from '@/i18n/useT';

/** "Expand (43 lines)", each language wording its own count so the gloss isn't nested inside the Arabic half. */
export function expandLabel(t: Translate, lines: number): string {
    return t.compose((say) => say('code.expand', { size: ref(pluralKey('size.lines', lines), { n: lines.toLocaleString('en-US') }) }));
}
