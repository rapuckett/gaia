// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { EmbedderDevice, EmbedderOption, EmbedderView } from '../services/memoryApi';

/** Value of the "default device" choice. */
export const EMBEDDER_PROFILE = 'profile';

export type EmbedderDeviceKey = 'settings.memory.embedder.npu' | 'settings.memory.embedder.gpu';

export function embedderDeviceKey(device: string): EmbedderDeviceKey {
    return device === 'npu' ? 'settings.memory.embedder.npu' : 'settings.memory.embedder.gpu';
}

/** One choice of the device picker: the default, or a device the PC may offer. */
export interface EmbedderChoice {
    value: string;
    /** `plain` is the device's own name; the others wrap it in the sentence for that state. */
    kind: 'default' | 'unavailable' | 'unproven' | 'plain';
    /** The device named in the label. */
    device: EmbedderDevice;
    /** Shown but not choosable: not available on this PC, or not proven. */
    disabled: boolean;
}

export function embedderChoices(view: EmbedderView): EmbedderChoice[] {
    return [
        { value: EMBEDDER_PROFILE, kind: 'default', device: view.default_device, disabled: false },
        ...view.options.map((o: EmbedderOption): EmbedderChoice => ({
            value: o.device,
            kind: o.present === false ? 'unavailable' : !o.proven ? 'unproven' : 'plain',
            device: o.device,
            disabled: o.available === false,
        })),
    ];
}

export function embedderSelected(view: EmbedderView): string {
    return view.chosen ? view.device : EMBEDDER_PROFILE;
}

/** The PUT body's device: `null` returns to the PC's setup. */
export function embedderRequestDevice(value: string): EmbedderDevice | null {
    return value === EMBEDDER_PROFILE ? null : (value as EmbedderDevice);
}

export interface EmbedderHints {
    /** The option the embedder runs on now. */
    current: EmbedderOption | undefined;
    npuUnproven: boolean;
    notDownloaded: boolean;
}

export function embedderHints(view: EmbedderView): EmbedderHints {
    const current = view.options.find((o) => o.device === view.device);
    return {
        current,
        npuUnproven: view.options.some((o) => o.device === 'npu' && !o.proven && !!o.present),
        notDownloaded: current?.downloaded === false,
    };
}
