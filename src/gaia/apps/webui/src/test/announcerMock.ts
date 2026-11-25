// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { vi } from 'vitest';

/** Stands in for components/LiveAnnouncer: tests assert what was announced. Use
 *  `vi.mock('<rel>/components/LiveAnnouncer', () => import('<rel>/test/announcerMock'))`. */
export const announce = vi.fn<(text: string) => void>();

export function useAnnounce(text: string | null | undefined): void {
    useEffect(() => {
        if (text) announce(text);
    }, [text]);
}

export function LiveAnnouncer() {
    return null;
}
