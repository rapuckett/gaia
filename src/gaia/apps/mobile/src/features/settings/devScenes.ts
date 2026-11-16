// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { SystemStatus } from '@webui/types';

import type { ContextChoice, GaiaClient, CustomModelReport, GpuMemoryStatus, ProviderModel, SpendingReport } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { COMMON, GPU } from '@/features/setup/devScenes';

import type { SectionId } from './sections';

/** A settings pane on a fake PC: which section, and the anchor it opens on. */
export interface SettingsScene {
    section: Extract<SectionId, 'advanced' | 'model' | 'setup'>;
    target?: string;
    gpuMemory: GpuMemoryStatus | Error;
    status?: FakeClientData['status'];
    /** The provider tab the Model pane opens on; local when unset. */
    provider?: string;
    /** More of the fake PC, over the common data. */
    data?: FakeClientData;
    /** An action that never finishes, so its in-flight state stays on screen: tap its button (`#tap=model-download-<id>` or `#tap=model-use-<id>`). */
    hang?: 'download' | 'select';
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

const model = (id: string, extra: Partial<ProviderModel> = {}): ProviderModel => ({
    id, display_name: id, context_length: null, downloaded: false, labels: [], rank: null, note: null, evidence: null,
    available: true, custom: false, price: null, recipe: null, size_gb: null, source_url: null, ...extra,
});
const HAVE = model('Gemma-4-E4B-it-GGUF', {
    display_name: 'Gemma 4 E4B', downloaded: true, state: 'loaded', fits: true, size_gb: 5.97,
    placement: { backend: 'vulkan', device: 'gpu', label: 'GPU (Vulkan)', source: 'reported', warning: null },
});
const WANT = model('Qwen3.6-35B-A3B-GGUF', { display_name: 'Qwen3.6 35B A3B', size_gb: 23.3, fits: true });
const WANT_SMALL = model('Llama-3.2-3B-Instruct-GGUF', { display_name: 'Llama 3.2 3B', size_gb: 2.1, fits: true });
const NEVER = model('Qwen3-Coder-480B-GGUF', { display_name: 'Qwen3 Coder 480B', size_gb: 290, available: false, unavailable_reason: 'needs 320 GB of memory' });
const MINE_CUSTOM = model('user.my-tuned-GGUF', {
    display_name: 'My tuned model', downloaded: true, custom: true, size_gb: 4.4, source_url: 'https://huggingface.co/me/my-tuned-GGUF',
});
const MINE_IN_USE = model('user.in-use-GGUF', { display_name: 'In-use custom model', downloaded: true, custom: true, size_gb: 3.2 });
const NPU_MODEL = model('gemma4-it-e4b-FLM', {
    display_name: 'Gemma 4 E4B (NPU)', recipe: 'flm', size_gb: 9.1, downloaded: true,
    placement: { backend: 'flm', device: 'npu', label: 'NPU', source: 'expected', warning: null },
    npu_problems: [
        { code: 'access', title: '', fix: '', params: { device: '/dev/accel/accel0', group: 'render' } },
        { code: 'memlock', title: '', fix: '', params: { limit: '8 MB', fix: 'apply' } },
    ],
});
const FIREWORKS_MODELS = [
    model('fireworks.qwen3p6', {
        display_name: 'Qwen3.6', rank: 1, note: 'best overall, fastest', evidence: '18/20 tasks · quality 4.6/5 · $0.42 per 20-task run',
        price: { input_per_million: 0.5, cached_input_per_million: 0.1, output_per_million: 3, source: 'list price' },
    }),
    model('fireworks.kimi-k2', {
        display_name: 'Kimi K2', rank: 2, note: 'cheapest', evidence: '16/20 tasks · quality 4.2/5 · $0.31 per 20-task run',
        price: { input_per_million: 0.3, cached_input_per_million: 0.05, output_per_million: 1.5, source: 'list price' },
    }),
    model('fireworks.other-a', { display_name: 'Other model A' }),
    model('fireworks.other-b', { display_name: 'Other model B' }),
];

const providers = (fireworksConfigured: boolean): NonNullable<FakeClientData['providers']> => ({
    providers: [
        { id: 'local', name: 'Local', remote: false, privacy_notice: '', configured: true, blocked: false },
        { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: '', configured: fireworksConfigured, blocked: false },
        { id: 'amd', name: 'AMD LLM Gateway', remote: true, privacy_notice: '', configured: false, blocked: false },
    ],
    lemonade_error: null,
});
const local = (models: ProviderModel[]): FakeClientData => ({ providerModels: { local: { provider: 'local', models } } });
const cloud = (models: ProviderModel[]): FakeClientData => ({ providers: providers(true), providerModels: { fireworks: { provider: 'fireworks', models } } });
const spent = (extra: Partial<SpendingReport>): SpendingReport => ({
    month: '2026-11', total_usd: 4.2, turns: 31, unpriced_turns: 0, unreported_turns: 0, limit_usd: null, state: 'no_limit', by_model: [], price_source: '', ...extra,
});
const HF_URL = 'https://huggingface.co/amd/Demo-Chat-GGUF';
const HF_REPORT: CustomModelReport = {
    url: HF_URL, ok: true, error: null, display_name: 'Demo Chat', model_id: 'user.Demo-Chat-GGUF', size_gb: 3.4, file: 'Demo-Chat-Q4_K_M.gguf', quant: 'Q4_K_M',
    checks: [{ id: 'chat', label: 'Chat model', ok: true, detail: 'Has a chat template' }, { id: 'fits', label: 'Fits this PC', ok: true, detail: 'Needs 4.6 GB' }],
    warnings: [], variants: [],
};

export const SETTINGS_SCENES: Record<string, SettingsScene> = {
    'advanced-not-installed': { section: 'advanced', gpuMemory: GPU, status: NOT_INSTALLED },
    'gpu-adjustable': { section: 'model', target: 'gpu-memory', gpuMemory: GPU },
    'gpu-adjustable-setup': { section: 'setup', gpuMemory: GPU },
    'gpu-pending': { section: 'model', target: 'gpu-memory', gpuMemory: PENDING },
    'gpu-read-error': { section: 'model', target: 'gpu-memory', gpuMemory: READ_ERROR },
    'gpu-read-error-setup': { section: 'setup', gpuMemory: READ_ERROR },
    // SET-MODEL-12: a cloud provider with no connected key shows Reconnect.
    'model-key-disconnected': { section: 'model', target: 'cloud-key', provider: 'fireworks', gpuMemory: GPU },
    // SET-MODEL-20: a cloud list with nothing in it says "No models match."; typing a miss into `model-search` shows the same on the local list.
    'model-search-empty': { section: 'model', target: 'models-on-pc', provider: 'fireworks', gpuMemory: GPU, data: cloud([]) },
    'model-local-empty': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([]) },
    // SET-MODEL-22: the local groups (Downloaded, Available to download) and, below, Fireworks' recommended picks with their benchmark note.
    'model-available': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, WANT, WANT_SMALL]) },
    'model-fireworks': { section: 'model', target: 'models-on-pc', provider: 'fireworks', gpuMemory: GPU, data: cloud(FIREWORKS_MODELS) },
    // SET-MODEL-23: the group is closed until tapped (`#tap=model-group-header-unavailable`).
    'model-unavailable': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, NEVER]) },
    // SET-MODEL-24, 25: a row downloading, and a Download tap that hangs (`#tap=model-download-Llama-3.2-3B-Instruct-GGUF`) with every button disabled.
    'model-downloading': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, hang: 'download',
        data: local([HAVE, model(WANT.id, { ...WANT, download_progress: { model_name: WANT.id, state: 'downloading', percent: 42, downloaded_bytes: 9.8e9, total_bytes: 23.3e9, file: null, file_index: 1, total_files: 1 } }), WANT_SMALL]),
    },
    // SET-MODEL-26: a Use tap that hangs (`#tap=model-use-user.my-tuned-GGUF`).
    'model-switching': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, hang: 'select', data: local([HAVE, MINE_CUSTOM]) },
    // SET-MODEL-24, 28: a custom model with Remove and its Details (`#tap=model-remove-user.my-tuned-GGUF` opens the confirm sheet); the custom model in use has none.
    'model-custom': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU,
        data: { ...local([MINE_IN_USE, MINE_CUSTOM, HAVE]), activeModel: { ...COMMON.activeModel!, model: MINE_IN_USE.id, display_name: MINE_IN_USE.display_name } },
    },
    // SET-MODEL-29: an NPU model whose setup is not ready.
    'model-npu-not-ready': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, NPU_MODEL]) },
    // SET-MODEL-30: type the link into `custom-model-url`, then `#tap=custom-model-check`, then `#tap=custom-model-add`; the success notice shows.
    'model-hf-added': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: { ...local([HAVE]), customReports: { [HF_URL]: HF_REPORT } } },
    // SET-MODEL-36 to 38: the cloud spending block (`cloud-spending`) under a connected cloud provider.
    'spend-total': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ limit_usd: 20, state: 'ok', unpriced_turns: 2, unreported_turns: 1 }) } },
    'spend-near-limit': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ total_usd: 17.4, limit_usd: 20, state: 'near' }) } },
    'spend-over-limit': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ total_usd: 20.3, limit_usd: 20, state: 'reached' }) } },
};

export function settingsSceneClient(scene: SettingsScene): GaiaClient {
    const client = createFakeClient({
        ...COMMON, contexts: { [CHAT_MODEL]: CONTEXT }, gpuMemory: scene.gpuMemory, ...(scene.status ? { status: scene.status } : {}), ...scene.data,
    });
    if (!scene.hang) return client;
    const never = () => new Promise<never>(() => undefined);
    return { ...client, ...(scene.hang === 'download' ? { downloadModel: never } : { selectModel: never }) };
}
