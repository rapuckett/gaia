// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ImageModel, ImageSettings } from '../services/imageApi';

/** Step counts offered beside a model's own; capped by the server's maximum. */
const STEP_CHOICES = [4, 8, 12, 20, 30, 50];

export function stepChoices(model: ImageModel, settings: Pick<ImageSettings, 'steps' | 'max_steps'>): number[] {
    return [...new Set([...STEP_CHOICES, model.default_steps, ...(settings.steps ? [settings.steps] : [])])]
        .filter((n) => n <= settings.max_steps)
        .sort((a, b) => a - b);
}
