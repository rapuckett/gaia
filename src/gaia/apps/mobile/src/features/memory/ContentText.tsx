// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useDirection } from '@/i18n/useT';
import { contentDir, Text, type TextProps } from '@/ui';

/** User content in any language: laid out in its own direction, aligned to the UI's start edge. */
export function ContentText({ children, ...props }: Omit<TextProps, 'dir' | 'align' | 'children'> & { children: string }) {
    const uiDir = useDirection();
    return (
        <Text {...props} dir={contentDir(children, uiDir)} align="start">
            {children}
        </Text>
    );
}
