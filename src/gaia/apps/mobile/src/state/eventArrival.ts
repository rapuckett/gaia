// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StreamEvent } from '@webui/types';

const ARRIVED = new WeakMap<object, number>();

/** Records when the phone received *event*, and returns it. */
export function stampArrival<T extends StreamEvent>(event: T, at: number = Date.now()): T {
    ARRIVED.set(event, at);
    return event;
}

/** When the phone received *event*; undefined for one it never received (a synthetic event). */
export function arrivalOf(event: StreamEvent): number | undefined {
    return ARRIVED.get(event);
}
