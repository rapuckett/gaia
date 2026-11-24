// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, type ComponentRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type ScrollView, type View } from 'react-native';

/** The setup screen's scroller, so a step can scroll one of its own views into place. */
export const SetupScrollContext = createContext<RefObject<ComponentRef<typeof ScrollView> | null> | null>(null);

/** Scrolls `node` to the top of the setup screen's scroller; false when either is not laid out yet. */
export function scrollNodeToTop(
    scroll: RefObject<ComponentRef<typeof ScrollView> | null> | null,
    node: ComponentRef<typeof View> | null,
    gap = 16,
): boolean {
    const scroller = scroll?.current;
    const inner = scroller?.getInnerViewRef?.() ?? scroller?.getInnerViewNode?.();
    if (!scroller || !node || !inner) return false;
    node.measureLayout(inner as never, (_x: number, y: number) => scroller.scrollTo({ y: Math.max(0, y - gap), animated: true }), () => undefined);
    return true;
}

/** Moves the screen reader to `node`, as a page change would; nothing when it has no native view yet. */
export function focusNode(node: ComponentRef<typeof View> | null): void {
    const tag = findNodeHandle(node);
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag);
}
