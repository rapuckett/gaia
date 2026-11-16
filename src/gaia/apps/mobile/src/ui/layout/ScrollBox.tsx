// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../controls/Icon';
import { ChevronDown } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

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
    const more = hint && box.content > box.view + 1 && offset < box.content - box.view - 1;
    return (
        <View>
            <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={{
                    maxHeight,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bgSecondary,
                }}
                contentContainerStyle={{ padding: space.md }}
                onLayout={hint ? (e) => setBox((b) => ({ ...b, view: e.nativeEvent.layout.height })) : undefined}
                onContentSizeChange={hint ? (_w, h) => setBox((b) => ({ ...b, content: h })) : undefined}
                onScroll={hint ? (e) => setOffset(e.nativeEvent.contentOffset.y) : undefined}
                scrollEventThrottle={64}
                testID={testID}
            >
                {children}
            </ScrollView>
            {more ? (
                <View
                    pointerEvents="none"
                    testID={testID ? `${testID}-more` : undefined}
                    style={{ position: 'absolute', start: 0, end: 0, bottom: 1, alignItems: 'center' }}
                >
                    <View
                        style={{
                            paddingHorizontal: space.sm,
                            backgroundColor: colors.bgSecondary,
                            borderWidth: 1,
                            borderBottomWidth: 0,
                            borderColor: colors.border,
                            borderTopStartRadius: radius.xs,
                            borderTopEndRadius: radius.xs,
                            opacity: 0.92,
                        }}
                    >
                        <Icon icon={ChevronDown} size="sm" tone="muted" />
                    </View>
                </View>
            ) : null}
        </View>
    );
}
