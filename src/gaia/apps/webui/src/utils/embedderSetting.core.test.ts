// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { EmbedderOption, EmbedderView } from '../services/memoryApi';
import { embedderChoices, embedderHints, embedderRequestDevice, embedderSelected } from './embedderSetting.core';

const opt = (device: 'npu' | 'gpu', extra: Partial<EmbedderOption> = {}): EmbedderOption => ({
    device, model: device, display_name: device, proven: true, present: true, available: true, reason: null, downloaded: true, ...extra,
});
const view = (options: EmbedderOption[], extra: Partial<EmbedderView> = {}): EmbedderView => ({ device: 'gpu', chosen: false, default_device: 'gpu', options, ...extra });

describe('embedder setting', () => {
    it('lists the default first, then each device in the state the PC reports', () => {
        const v = view([opt('npu', { proven: false, available: false }), opt('gpu', { present: false, available: false })]);
        expect(embedderChoices(v).map((c) => [c.value, c.kind, c.disabled])).toEqual([
            ['profile', 'default', false], ['npu', 'unproven', true], ['gpu', 'unavailable', true],
        ]);
    });

    it('selects the device only when the person chose it, and sends null for the default', () => {
        expect(embedderSelected(view([], { chosen: false, device: 'npu' }))).toBe('profile');
        expect(embedderSelected(view([], { chosen: true, device: 'npu' }))).toBe('npu');
        expect(embedderRequestDevice('profile')).toBeNull();
        expect(embedderRequestDevice('npu')).toBe('npu');
    });

    it('hints at an unproven NPU that is present, and at a model still to download', () => {
        const h = embedderHints(view([opt('npu', { proven: false }), opt('gpu', { downloaded: false })]));
        expect([h.npuUnproven, h.notDownloaded]).toEqual([true, true]);
        expect(embedderHints(view([opt('npu', { proven: false, present: false }), opt('gpu')])).npuUnproven).toBe(false);
    });
});
