// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { SystemStatus } from '@webui/types';

import type { ContextChoice, GaiaClient, GpuMemoryStatus } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { COMMON, GPU } from '@/features/setup/devScenes';

import type { SectionId } from './sections';

/** A settings pane on a fake PC: which section, and the anchor it opens on. */
export interface SettingsScene {
    section: Extract<SectionId, 'advanced' | 'model' | 'setup'>;
    target?: string;
    gpuMemory: GpuMemoryStatus | Error;
    status?: FakeClientData['status'];
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

const NOT_INSTALLED = {
    lemonade_running: false, lemonade_error: null, start_command: null, start_instruction: 'Run gaia init to install the model server.',
    model_loaded: null, embedding_model_loaded: false, disk_space_gb: 120, memory_available_gb: 40, initialized: false,
    context_size_sufficient: true, download_progress: null, expected_model_loaded: false, model_downloaded: null,
} as unknown as SystemStatus;

export const SETTINGS_SCENES: Record<string, SettingsScene> = {
    'advanced-not-installed': { section: 'advanced', gpuMemory: GPU, status: NOT_INSTALLED },
    'gpu-adjustable': { section: 'model', target: 'gpu-memory', gpuMemory: GPU },
    'gpu-adjustable-setup': { section: 'setup', gpuMemory: GPU },
    'gpu-pending': { section: 'model', target: 'gpu-memory', gpuMemory: PENDING },
    'gpu-read-error': { section: 'model', target: 'gpu-memory', gpuMemory: READ_ERROR },
    'gpu-read-error-setup': { section: 'setup', gpuMemory: READ_ERROR },
};

export function settingsSceneClient(scene: SettingsScene): GaiaClient {
    return createFakeClient({ ...COMMON, contexts: { [CHAT_MODEL]: CONTEXT }, gpuMemory: scene.gpuMemory, ...(scene.status ? { status: scene.status } : {}) });
}
