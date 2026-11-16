// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Dimensions } from 'react-native';

/** iOS's largest accessibility text size (AX5) as React Native reports it. */
export const AX_FONT_SCALE = 3.1;

/** Makes `useWindowDimensions()` report this text size; undo with `jest.restoreAllMocks()`. */
export function atFontScale(scale: number): void {
    const window = Dimensions.get('window');
    jest.spyOn(Dimensions, 'get').mockImplementation(() => ({ ...window, fontScale: scale }));
}
