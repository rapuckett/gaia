// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient } from '@/api/fake';
import type { ContextChoice, GaiaClient, GpuMemoryStatus } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { COMMON, GPU } from '@/features/setup/devScenes';

import type { SectionId } from './sections';

/** A settings pane on a fake PC: which section, and the anchor it opens on. */
export interface SettingsScene {
    section: Extract<SectionId, 'model' | 'setup'>;
    target?: string;
    gpuMemory: GpuMemoryStatus | Error;
}

const PENDING: GpuMemoryStatus = {
    ...GPU,
    pending: { setting_gb: 32, previous_setting_gb: 16, source: 'guided', recorded_at: '2026-11-15T09:30:00Z', state: 'restart_required' },
};
const CHAT_MODEL = 'Gemma-4-E4B-it-GGUF';
const CONTEXT: ContextChoice = {
    model: CHAT_MODEL, display_name: 'Gemma 4 E4B', chosen: null, automatic: 65536, min: 4096, max_fit: 131072,
    options: [8192, 16384, 32768, 65536, 131072], loaded_ctx: 65536, memory_source: 'gpu', note: null,
};
const READ_ERROR = new GaiaApiError(500, 'GAIA could not read this PC’s graphics memory setting.');

export const SETTINGS_SCENES: Record<string, SettingsScene> = {
    'gpu-adjustable': { section: 'model', target: 'gpu-memory', gpuMemory: GPU },
    'gpu-adjustable-setup': { section: 'setup', gpuMemory: GPU },
    'gpu-pending': { section: 'model', target: 'gpu-memory', gpuMemory: PENDING },
    'gpu-read-error': { section: 'model', target: 'gpu-memory', gpuMemory: READ_ERROR },
    'gpu-read-error-setup': { section: 'setup', gpuMemory: READ_ERROR },
};

export function settingsSceneClient(scene: SettingsScene): GaiaClient {
    return createFakeClient({ ...COMMON, contexts: { [CHAT_MODEL]: CONTEXT }, gpuMemory: scene.gpuMemory });
}
