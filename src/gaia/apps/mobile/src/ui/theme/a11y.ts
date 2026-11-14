// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

export interface A11yVisibility {
    accessible?: boolean;
    accessibilityElementsHidden?: boolean;
    importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
}

/** The screen-reader visibility props for native; on web they would reach the DOM as unknown attributes, so `aria-hidden` stands in. */
export function a11yVisibility(props: A11yVisibility): A11yVisibility & { 'aria-hidden'?: boolean } {
    if (Platform.OS !== 'web') return props;
    const hidden = props.accessibilityElementsHidden || props.importantForAccessibility === 'no-hide-descendants';
    return { ...(props.accessible ? { accessible: true } : {}), ...(hidden ? { 'aria-hidden': true } : {}) };
}
