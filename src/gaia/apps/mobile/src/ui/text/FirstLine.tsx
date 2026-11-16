// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useDirection } from '@/i18n/useT';
import { useLargeText } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import type { TypeRole } from '../tokens/type';
import { lineHeightOf, maxScaleFor } from './Text';

export interface FirstLineProps {
    /** The role of the text the icon sits beside. */
    role?: TypeRole;
    /** Space above that text inside its own box, so the icon drops by the same amount. */
    inset?: number;
    /** The cap the text beside the icon scales to (its `maxScale`), so the icon follows that text's real first line. */
    maxScale?: number;
    /** The text beside the icon is `compact`, so it stops at the compact cap. */
    compact?: boolean;
    children: ReactNode;
}

/**
 * Holds an icon beside text that may wrap. At large sizes the row aligns to its start, and this
 * centers the icon on the text's first line; at the default size it renders the icon untouched.
 */
export function FirstLine({ role = 'body', inset = 0, maxScale, compact, children }: FirstLineProps) {
    const largeText = useLargeText();
    const { fontScale } = useWindowDimensions();
    const { type } = useTheme();
    const rtl = useDirection() === 'rtl';
    if (!largeText) return <>{children}</>;
    const scale = Math.min(fontScale, maxScale ?? maxScaleFor(role, compact) ?? fontScale);
    return (
        <View testID="first-line" style={{ minHeight: lineHeightOf(type[role], role, rtl) * scale, marginTop: inset, justifyContent: 'center' }}>
            {children}
        </View>
    );
}
