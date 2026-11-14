// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ScrollView } from 'react-native';
import type { ReactNode } from 'react';

/** Content wider than its box scrolls sideways inside it and never widens the page. */
export function HScroll({ children, dir, testID }: { children?: ReactNode; dir?: 'ltr' | 'rtl'; testID?: string }) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={dir ? { direction: dir } : undefined} testID={testID}>
            {children}
        </ScrollView>
    );
}
