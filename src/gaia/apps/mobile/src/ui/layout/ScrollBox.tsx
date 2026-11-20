// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../controls/Icon';
import { ChevronDown } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

/** Height of the strip under a hinted box that holds the chevron, outside the scrolling viewport. */
const HINT_STRIP = 24;
/** How near the bottom, in points, still counts as at the end for `stickToEnd`. */
const END_SLOP = 16;

export interface ScrollBoxProps {
    /** Height in points at which the content starts to scroll. */
    maxHeight: number;
    children?: ReactNode;
    testID?: string;
    /** Shows a chevron at the bottom edge while there is more below, so a cut line reads as "scroll", not as clipped. */
    hint?: boolean;
    /** Follows new content to the end, except while the person has scrolled up; back at the bottom, it follows again. */
    stickToEnd?: boolean;
    /** Each new value scrolls to the end once, even when scrolled up; with `stickToEnd` it follows from there (a run that just ended). */
    settleKey?: string | number;
}

/** A bounded region that scrolls vertically (a tool step's output); never sideways, so long lines wrap unless the child is an `HScroll`. */
export function ScrollBox({ maxHeight, children, testID, hint = false, stickToEnd = false, settleKey }: ScrollBoxProps) {
    const { colors, radius, space } = useTheme();
    const [box, setBox] = useState({ view: 0, content: 0 });
    const [offset, setOffset] = useState(0);
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const atEnd = useRef(true);
    const lastY = useRef(0);
    const toEnd = () => {
        scroller.current?.scrollToEnd({ animated: false });
        if (hint) setOffset(Infinity);
    };
    const follow = () => {
        if (stickToEnd && atEnd.current) toEnd();
    };
    useEffect(() => {
        if (settleKey === undefined) return;
        atEnd.current = true;
        scroller.current?.scrollToEnd({ animated: false });
    }, [settleKey]);
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
                ref={scroller}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={{ maxHeight: maxHeight - 2 - (overflows ? HINT_STRIP : 0) }}
                contentContainerStyle={{ padding: space.md }}
                onLayout={(e) => {
                    if (hint) setBox((b) => ({ ...b, view: e.nativeEvent.layout.height }));
                    follow();
                }}
                onContentSizeChange={(_w, h) => {
                    if (hint) setBox((b) => ({ ...b, content: h }));
                    follow();
                }}
                onScroll={(e) => {
                    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                    if (stickToEnd) {
                        // Only a move up pauses following: our scrolls go down, and their events may arrive stale or not at all.
                        if (contentOffset.y < lastY.current - 1) atEnd.current = false;
                        else if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLOP) atEnd.current = true;
                        lastY.current = contentOffset.y;
                    }
                    if (hint) setOffset(stickToEnd && atEnd.current ? Infinity : contentOffset.y);
                }}
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
