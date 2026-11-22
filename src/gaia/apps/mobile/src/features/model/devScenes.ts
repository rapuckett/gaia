// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ActiveModel, AgentInfo, LemonadeTarget, LocalModelStatus, ModelNeed, ResourceUsage, SetupCheck } from '@webui/types';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { GaiaClient } from '@/api/client.types';
import type { FlagshipInstallState } from '@/data';

import type { NeedPromptInitial } from './ModelNeededHost';

/** What a model-server scene shows, and the state its component can't be tapped into. */
export interface ModelScene {
    view: 'sheet' | 'need' | 'down' | 'resources' | 'agent' | 'error' | 'restore';
    data?: FakeClientData;
    sheet?: { confirming?: boolean; logRefused?: boolean };
    need?: ModelNeed;
    needInitial?: NeedPromptInitial;
    downAsked?: boolean;
    /** `press` taps "Use GAIA's own server" on open; `done` opens after a switch worked; `never` leaves the switch unanswered. */
    downSwitch?: 'press' | 'done' | 'never';
    agentState?: FlagshipInstallState;
    errorVariant?: 'window' | 'fill' | 'compact';
    /** What the switch to GAIA's own server throws. */
    switchError?: Error;
    /** The first status read never answers. */
    pending?: boolean;
}

const LOADED: LocalModelStatus = {
    state: 'loaded', active_model: 'Gemma-4-E4B-it-GGUF', active_display_name: 'Gemma 4 E4B', active_remote: false, model: 'Gemma-4-E4B-it-GGUF',
    display_name: 'Gemma 4 E4B', placement: { device: 'gpu', backend: 'vulkan', label: 'GPU · Vulkan', source: 'reported', warning: null }, ctx_size: 65536,
    memory: { source: 'AMD iGPU', total_gb: 16, free_gb: 6.4, model_gb: 5.9 }, memory_error: null, error: null, base_url: 'http://127.0.0.1:13305/api/v1',
    owner: 'gaia', busy: false, busy_reason: null, restarting: false, restart_error: null,
};
const model = (patch: Partial<LocalModelStatus>): FakeClientData => ({ localModel: { ...LOADED, ...patch } });

const STOPPED: Partial<LocalModelStatus> = {
    state: 'stopped', active_model: null, active_display_name: null, placement: null, ctx_size: null, memory: null, error: 'The model server is not answering.', error_cause: 'model_server_down',
};

const EXTERNAL: LemonadeTarget = {
    mode: 'external', saved_mode: 'external', source: 'config', base_url: 'http://192.168.1.20:13305/api/v1', saved_base_url: 'http://192.168.1.20:13305/api/v1',
    api_key_stored: false, gaia_installed: true, offer: false, what_gaia_does: '',
};
const other = (patch: Partial<FakeClientData> = {}): FakeClientData => ({ ...model({ ...STOPPED, owner: 'user' }), lemonadeTarget: EXTERNAL, ...patch });

const NEED_CHAT: ModelNeed = { job: 'chat', needed: true, model: { id: 'Gemma-4-E4B-it-GGUF', name: 'Gemma 4 E4B', size_gb: 5.97, source: 'huggingface.co/amd' }, disk_free_gb: 120 };

const ACTIVE_MODEL: ActiveModel = { provider: 'local', model: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B', label: 'Gemma 4 E4B', remote: false, is_default: true };
const ACTIVE_RESTORE = (restore: NonNullable<ActiveModel['restore']>): ActiveModel => ({ ...ACTIVE_MODEL, restore });

const bars = (n: number) => Array.from({ length: 20 }, (_, i) => Math.round(n + ((i * 7) % 11) - 5));
const RESOURCES: ResourceUsage = {
    interval_ms: 1000, ready: true,
    cpu: { percent: 38, ghz: 3.6, history: bars(38) },
    memory: { used_bytes: 21e9, total_bytes: 64e9, percent: 33, history: bars(33) },
    devices: [
        { id: 'gpu0', name: 'AMD Radeon 8060S', kind: 'gpu', percent: 71, memory_used_bytes: 6e9, history: bars(71) },
        { id: 'npu0', name: 'AMD XDNA 2 NPU', kind: 'npu', percent: 12, memory_used_bytes: null, history: bars(12) },
    ],
    networks: [{ id: 'eth0', name: 'Ethernet', description: 'Realtek 2.5GbE', kind: 'ethernet', send_bps: 120_000, recv_bps: 2_400_000, send_history: [1, 2, 3], recv_history: [3, 2, 1] }],
};

const NO_FLAGSHIP: Partial<FakeClientData> = { agents: [] as AgentInfo[] };

export const MODEL_SCENES: Record<string, ModelScene> = {
    'agent-failed': { view: 'agent', data: NO_FLAGSHIP, agentState: { kind: 'failed', error: new Error('Not enough disk space to install the GAIA agent.') } },
    'agent-installing': { view: 'agent', data: NO_FLAGSHIP, agentState: { kind: 'installing', percent: 40 } },
    'agent-missing': { view: 'agent', data: NO_FLAGSHIP },
    'agent-no-build': { view: 'agent', data: { ...NO_FLAGSHIP, setupChecks: [{ ready: false, no_agent_build: true, steps: [] } as SetupCheck] } },
    'down-back': { view: 'down', data: model({ ...STOPPED, state: 'idle', error: null, error_cause: null }), downAsked: true },
    'down-switch': { view: 'down', data: other() },
    'down-switch-done': { view: 'down', data: other({ ...model({ ...STOPPED, state: 'idle', error: null, error_cause: null }), lemonadeTarget: { ...EXTERNAL, mode: 'gaia', source: 'gaia' } }), downSwitch: 'done' },
    'down-switch-env': { view: 'down', data: other({ lemonadeTarget: { ...EXTERNAL, source: 'env' } }) },
    'down-switch-failed': { view: 'down', data: other(), downSwitch: 'press', switchError: new GaiaApiError(500, 'Lemonade refused to start: port 13305 is in use.') },
    'down-switch-pc-only': { view: 'down', data: other({ serverChangeError: new GaiaApiError(403, 'Forbidden') }), downSwitch: 'press' },
    'down-switching': { view: 'down', data: other(), downSwitch: 'never' },
    'down-not-ours': { view: 'down', data: model({ ...STOPPED, owner: 'user' }) },
    'down-ours': { view: 'down', data: model(STOPPED) },
    'down-restart-error': { view: 'down', data: model({ ...STOPPED, restart_error: 'lemond exited with code 1: port 13305 is in use.' }) },
    'down-starting': { view: 'down', data: model({ ...STOPPED, restarting: true }), downAsked: true },
    'down-still-down': { view: 'down', data: model(STOPPED), downAsked: true },
    'error-compact': { view: 'error', errorVariant: 'compact' },
    'error-fill': { view: 'error', errorVariant: 'fill' },
    'error-window': { view: 'error', errorVariant: 'window' },
    'need-chat': { view: 'need', need: NEED_CHAT },
    'need-downloading': { view: 'need', need: NEED_CHAT, needInitial: { downloading: true, percent: 42 } },
    'need-failed': { view: 'need', need: NEED_CHAT, needInitial: { failed: true } },
    'need-low-disk': { view: 'need', need: { ...NEED_CHAT, job: 'vision', model: { ...NEED_CHAT.model!, name: 'Gemma 4 E4B (vision)', size_gb: 9.1 }, disk_free_gb: 4.2 } },
    'need-npu-images-off': { view: 'need', need: { job: 'vision', needed: false, model: null, disk_free_gb: null, off: 'npu' } },
    'need-starting': { view: 'need', need: NEED_CHAT, needInitial: { downloading: true, percent: null } },
    'restore-failed': { view: 'restore', data: { activeModel: ACTIVE_RESTORE({ status: 'failed', message: 'The saved model Claude Sonnet could not be restored: its API key is missing.' }) } },
    'restore-ok': { view: 'restore', data: { activeModel: ACTIVE_RESTORE({ status: 'restored', message: 'Restored your saved model, Gemma 4 E4B.' }) } },
    'resources-full': { view: 'resources', data: { resources: RESOURCES } },
    'resources-reading': { view: 'resources', data: { resources: { interval_ms: 1000, ready: false } } },
    'resources-unreadable': { view: 'resources', data: { resources: { ...RESOURCES, devices: [], devices_error: 'GPU counters need Windows 11.' } } },
    'resources-error': { view: 'resources' },
    'sheet-checking': { view: 'sheet', pending: true },
    'sheet-cloud': { view: 'sheet', data: model({ active_remote: true, active_display_name: 'Claude Sonnet', state: 'idle', placement: null, memory: null }) },
    'sheet-confirm-reload': { view: 'sheet', data: model({ owner: 'user' }), sheet: { confirming: true } },
    'sheet-error': { view: 'sheet', data: model({ error: 'The model failed to load: out of memory.' }) },
    'sheet-idle': { view: 'sheet', data: model({ state: 'idle', memory: { source: 'AMD iGPU', total_gb: 16, free_gb: 14.2, model_gb: null } }) },
    'sheet-loaded': { view: 'sheet', data: model({}) },
    'sheet-loaded-answering': { view: 'sheet', data: model({ busy: true, busy_reason: 'request' }) },
    'sheet-log-refused': { view: 'sheet', data: model({}), sheet: { logRefused: true } },
    'sheet-memory-unknown': { view: 'sheet', data: model({ memory: null, memory_error: null }) },
    'sheet-npu': { view: 'sheet', data: model({ display_name: 'Gemma 4 E4B (NPU)', placement: { device: 'npu', backend: 'flm', label: 'NPU · FLM', source: 'reported', warning: null }, memory: { source: 'system memory', total_gb: 32, free_gb: 11, model_gb: 9.1 } }) },
    'sheet-placement-warning': { view: 'sheet', data: model({ placement: { device: 'cpu', backend: 'cpu', label: 'CPU', source: 'reported', warning: 'The model runs on the CPU, not the GPU, so answers will be slow.' } }) },
    'sheet-read-failed': { view: 'sheet' },
    'sheet-restart-error': { view: 'sheet', data: model({ restart_error: 'The model server did not come back after 30 s.' }) },
    'sheet-restarting': { view: 'sheet', data: model({ restarting: true }) },
    'sheet-stopped': { view: 'sheet', data: model(STOPPED) },
    'sheet-stopped-not-ours': { view: 'sheet', data: model({ ...STOPPED, owner: 'user' }) },
    'sheet-warming': { view: 'sheet', data: model({ state: 'warming', busy: true, busy_reason: 'warm_up' }) },
};

export function modelSceneClient(scene: ModelScene): GaiaClient {
    const client = createFakeClient({ ...scene.data });
    const pending = () => new Promise<never>(() => undefined);
    return {
        ...client,
        ...(scene.pending ? { getLocalModelStatus: pending } : {}),
        ...(scene.downSwitch === 'never' ? { setLemonadeTarget: pending } : {}),
        ...(scene.switchError ? { setLemonadeTarget: () => Promise.reject(scene.switchError) } : {}),
    };
}
