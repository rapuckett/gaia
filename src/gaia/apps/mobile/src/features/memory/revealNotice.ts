// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, type ComponentRef, type RefObject } from 'react';
import { AccessibilityInfo, type ScrollView, type View } from 'react-native';

type Scroller = ComponentRef<typeof ScrollView>;

/** The Memory screen's outer scroll body, so a pane can bring something it just showed into view. */
export const MemoryScrollContext = createContext<RefObject<Scroller | null> | null>(null);

/** How far to scroll (positive is down) to show the whole item with the least movement; 0 when it is already visible. */
export function minimalScrollDelta(viewTop: number, viewHeight: number, itemTop: number, itemHeight: number): number {
    const above = itemTop - viewTop;
    const below = itemTop + itemHeight - (viewTop + viewHeight);
    if (above < 0) return above;
    // An item taller than the viewport lines up with the top edge instead.
    if (below > 0) return Math.min(below, above);
    return 0;
}

/** Scrolls the node into view once it mounts, only if the Memory scroll body clips it. Never moves accessibility focus. */
export function useRevealOnMount(node: RefObject<ComponentRef<typeof View> | null>, active: boolean) {
    const scroller = useContext(MemoryScrollContext);
    useEffect(() => {
        if (!active || !scroller) return;
        let cancelled = false;
        const frame = requestAnimationFrame(() => {
            const scroll = scroller.current;
            const item = node.current;
            const inner = scroll?.getInnerViewRef?.() ?? scroll?.getInnerViewNode?.();
            if (!scroll || !item || !inner) return;
            scroll.measureInWindow((_vx, viewTop, _vw, viewHeight) => {
                item.measureInWindow((_ix, itemTop, _iw, itemHeight) => {
                    item.measureLayout(
                        inner as never,
                        (_x: number, contentY: number) => {
                            const delta = minimalScrollDelta(viewTop, viewHeight, itemTop, itemHeight);
                            if (delta === 0) return;
                            const offset = contentY - (itemTop - viewTop);
                            void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
                                if (!cancelled) scroll.scrollTo({ y: Math.max(0, offset + delta), animated: !reduced });
                            });
                        },
                        () => undefined,
                    );
                });
            });
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [active, node, scroller]);
}
