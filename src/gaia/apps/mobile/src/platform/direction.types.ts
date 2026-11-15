// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

export type Direction = 'ltr' | 'rtl';

export type ApplyDirection = (dir: Direction, lang: string) => void;

/** The direction the screen is laid out in right now (native layout only changes on restart). */
export type LayoutDirection = () => Direction;
