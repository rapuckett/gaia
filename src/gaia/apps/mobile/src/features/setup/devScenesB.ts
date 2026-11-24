// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GpuMemoryPending, SetupRunStatus } from '@webui/types';

import type { FakeClientData } from '@/api/fake';
import type { GpuMemoryStatus, SetupPlan } from '@/api/client.types';

import { COMMON, GPU, SETUP_SCENES, type SetupScene } from './devScenes';

const fromScene = (key: string): FakeClientData => {
    const found = SETUP_SCENES[key];
    if (!found) throw new Error(`devScenesB builds on the "${key}" scene, which devScenes no longer has.`);
    return found.data;
};

const plan = (data: FakeClientData): SetupPlan => {
    if (!data.setupPlan) throw new Error('devScenesB needs a scene that carries a setup plan.');
    return data.setupPlan;
};

const run = (data: FakeClientData): SetupRunStatus => {
    if (!data.setupStatus) throw new Error('devScenesB needs a scene that carries a setup run.');
    return data.setupStatus;
};

const pending = (state: GpuMemoryPending['state'], source: GpuMemoryPending['source'] = 'guided'): GpuMemoryPending => ({
    setting_gb: 32, previous_setting_gb: 16, source, recorded_at: '2026-11-16T10:00:00Z', state,
});

const GPU_RESTART: GpuMemoryStatus = { ...GPU, pending: pending('restart_required') };
const GPU_TOOK_EFFECT: GpuMemoryStatus = {
    ...GPU, gpu_gb: 32, cpu_gb: 96, setting: { name: 'Variable Graphics Memory', current_gb: 32, min_gb: 4, max_gb: 96 }, pending: pending('took_effect'),
};
const GPU_NOT_APPLIED: GpuMemoryStatus = { ...GPU, pending: pending('not_applied') };
const GPU_LINUX: GpuMemoryStatus = {
    ...GPU, os: 'linux', method: 'guided', method_reason: 'On Linux this is set on the kernel command line.', setting: undefined,
    guided_value: '8388608',
    guided_steps: [
        "Run: echo 'options ttm pages_limit=8388608' | sudo tee /etc/modprobe.d/ttm.conf",
        'Rebuild the boot image. Ubuntu: sudo update-initramfs -u · Fedora: sudo dracut --regenerate-all -f',
        'Restart your PC, then come back here. GAIA reads the new split.',
    ],
};

const READY = fromScene('ready/default');
const READY_PLAN = plan(READY);
const READY_RUN = run(READY);
const SKIPPED_IDS = ['Whisper-Large-v3-Turbo', 'kokoro-v1'];
const READY_NOT_INSTALLED: FakeClientData = {
    ...READY,
    setupPlan: { ...READY_PLAN, catalog: (READY_PLAN.catalog ?? []).map((e) => (SKIPPED_IDS.includes(e.id) ? { ...e, planned: true, skipped: true } : e)) },
    setupStatus: {
        ...READY_RUN,
        models: [
            ...(READY_RUN.models ?? []),
            ...SKIPPED_IDS.map((id) => ({
                id, roles: [], state: 'skipped' as const, bytes_done: 0, bytes_total: 0, speed_bps: 0, eta_s: null, error: null,
                error_kind: null, can_retry: false, retrying_until: null, downloaded_before_gb: null,
            })),
        ],
    },
};
const READY_TEST_FAILED: FakeClientData = {
    ...READY,
    setupStatus: {
        ...READY_RUN,
        tests: [
            { job: 'chat', subject: READY_RUN.chat_model ?? null, state: 'passed', error: null, kind: null, seconds: 14 },
            { job: 'speech', subject: SKIPPED_IDS[0], state: 'failed', error: 'The test sound came back empty.', kind: 'broken', seconds: 3 },
        ],
    },
};

const DOWNLOAD_FAILED = fromScene('download/failed');
const DOWNLOAD_FAILED_RUN = run(DOWNLOAD_FAILED);
const DOWNLOAD_LOGS: SetupRunStatus = {
    ...DOWNLOAD_FAILED_RUN,
    logs: {
        check: ['Reading this PC', 'Found AMD Radeon(TM) 8060S Graphics, 16.0 GB for the GPU', 'Model server answers at http://127.0.0.1:13305/api/v1'],
        download: [
            'Downloading user.embeddinggemma-300m-GGUF',
            'user.embeddinggemma-300m-GGUF: 100%',
            'Downloading Gemma-4-E4B-it-GGUF',
            'Gemma-4-E4B-it-GGUF: 33%',
            'Connection reset by peer',
        ],
    },
};

const SERVER_INSTALLING: SetupRunStatus = {
    state: 'running', server_only: true, text: 'Starting the local model server', steps: [], log_tail: [],
    components: { server: 'done', backend: 'active' }, percent: 45,
};
const CHECK_COLD = fromScene('check/running');

const blockedPc = (): FakeClientData => ({ preflight: fromScene('check/blocked').preflight });

const withProviders = (changes: Record<string, object>): NonNullable<FakeClientData['providers']> => ({
    ...COMMON.providers!,
    providers: COMMON.providers!.providers.map((p) => ({ ...p, ...changes[p.id] })),
});

/** Setup states the first-run rows in batch B need: the blocked PC, GPU steps and results, logs, server install, gateway key and Ready notes. */
export const SETUP_SCENES_B: Record<string, SetupScene> = {
    'check/installing': { stage: 'check', data: { ...CHECK_COLD, setupStatus: SERVER_INSTALLING } },
    'download/logs': { stage: 'download', data: { ...DOWNLOAD_FAILED, setupStatus: DOWNLOAD_LOGS } },
    'gpu/guided-linux': { stage: 'plan', screen: 'gpu', data: { gpuMemory: GPU_LINUX } },
    'gpu/not-applied': { stage: 'plan', screen: 'gpu', data: { gpuMemory: GPU_NOT_APPLIED } },
    'gpu/restart': { stage: 'plan', screen: 'gpu', data: { gpuMemory: GPU_RESTART } },
    'gpu/took-effect': { stage: 'plan', screen: 'gpu', data: { gpuMemory: GPU_TOOK_EFFECT } },
    'key/gateway': {
        stage: 'plan', screen: 'key',
        data: {
            lemonadeTarget: { ...COMMON.lemonadeTarget!, source: 'gaia' },
            activeModel: { ...COMMON.activeModel!, provider: 'amd', model: 'gateway-model', display_name: 'Gateway model', label: 'Gateway model', remote: true, is_default: false },
        },
    },
    'key/gateway-down': {
        stage: 'plan', screen: 'key',
        data: {
            lemonadeTarget: { ...COMMON.lemonadeTarget!, source: 'gaia' },
            activeModel: { ...COMMON.activeModel!, provider: 'amd', model: 'gateway-model', display_name: 'Gateway model', label: 'Gateway model', remote: true, is_default: false },
            providers: withProviders({ amd: { network: { reachable: false } } }),
        },
    },
    'key/env': {
        stage: 'plan', screen: 'key',
        data: {
            lemonadeTarget: { ...COMMON.lemonadeTarget!, source: 'gaia' },
            providers: withProviders({ fireworks: { configured: true, key_source: 'environment', key_hint: '9c1e', env_var: 'FIREWORKS_API_KEY' } }),
        },
    },
    'key/env-unnamed': {
        stage: 'plan', screen: 'key',
        data: {
            lemonadeTarget: { ...COMMON.lemonadeTarget!, source: 'gaia' },
            providers: withProviders({ fireworks: { configured: true, key_source: 'environment', key_hint: '9c1e', env_var: null } }),
        },
    },
    'plan/blocked': { stage: 'plan', data: blockedPc() },
    'ready/gpu-now': { stage: 'ready', data: { ...READY, gpuMemory: GPU_TOOK_EFFECT } },
    'ready/gpu-restart': { stage: 'ready', data: { ...READY, gpuMemory: GPU_RESTART } },
    'ready/not-installed': { stage: 'ready', data: READY_NOT_INSTALLED },
    'ready/test-failed': { stage: 'ready', data: READY_TEST_FAILED },
};
