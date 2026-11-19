// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../controls/Icon';
import { ChevronDown } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

/** Height of the strip under a hinted box that holds the chevron, outside the scrolling viewport. */
const HINT_STRIP = 24;

export interface ScrollBoxProps {
    /** Height in points at which the content starts to scroll. */
    maxHeight: number;
    children?: ReactNode;
    testID?: string;
    /** Shows a chevron at the bottom edge while there is more below, so a cut line reads as "scroll", not as clipped. */
    hint?: boolean;
}

/** A bounded region that scrolls vertically (a tool step's output); never sideways, so long lines wrap unless the child is an `HScroll`. */
export function ScrollBox({ maxHeight, children, testID, hint = false }: ScrollBoxProps) {
    const { colors, radius, space } = useTheme();
    const [box, setBox] = useState({ view: 0, content: 0 });
    const [offset, setOffset] = useState(0);
    // Past maxHeight (less the 1 pt border each side) the box reserves a hint strip, so the chevron never covers text.
    const overflows = hint && box.content > maxHeight - 2;
    const more = overflows && box.content > box.view + 1 && offset < box.content - box.view - 1;
    return (
        <View
            style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgSecondary,
                overflow: 'hidden',
            }}
        >
            <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={{ maxHeight: maxHeight - 2 - (overflows ? HINT_STRIP : 0) }}
                contentContainerStyle={{ padding: space.md }}
                onLayout={hint ? (e) => setBox((b) => ({ ...b, view: e.nativeEvent.layout.height })) : undefined}
                onContentSizeChange={hint ? (_w, h) => setBox((b) => ({ ...b, content: h })) : undefined}
                onScroll={hint ? (e) => setOffset(e.nativeEvent.contentOffset.y) : undefined}
                scrollEventThrottle={64}
                testID={testID}
            >
                {children}
            </ScrollView>
            {overflows ? (
                <View pointerEvents="none" style={{ height: HINT_STRIP, alignItems: 'center', justifyContent: 'center' }}>
                    {more ? (
                        <View testID={testID ? `${testID}-more` : undefined}>
                            <Icon icon={ChevronDown} size="sm" tone="muted" />
                        </View>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}
