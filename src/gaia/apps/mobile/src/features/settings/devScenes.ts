// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { SystemStatus } from '@webui/types';
import { tEn } from '@webui/i18n/translator';

import type { SkillsAddSeed } from '@/features/skills';
import type { Automation, AutomationList, LinkAddResult, LinkPreview, LinkSkill, ContextChoice, Session, SkillInfo, DiscordStatus, GaiaClient, CustomModelReport, GpuMemoryStatus, LemonadeTarget, MCPServerStatus, ModelServerInfo, ProviderModel, ProviderSummary, Settings, SpendingReport } from '@/api/client.types';
import { PC_ONLY_REFUSAL } from '@/api/constants';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { DevicePromptKind, DevicePromptNote, DevicePromptState } from '@/features/devices/devicePrompts';
import { COMMON, GPU, RUN } from '@/features/setup/devScenes';

import type { SectionId } from './sections';

/** A settings pane on a fake PC: which section, and the anchor it opens on. */
export interface SettingsScene {
    section: Extract<SectionId, 'advanced' | 'automations' | 'general' | 'messaging' | 'model' | 'permissions' | 'privacy' | 'setup' | 'skills' | 'voice'>;
    target?: string;
    gpuMemory: GpuMemoryStatus | Error;
    status?: FakeClientData['status'];
    /** The provider tab the Model pane opens on; local when unset. */
    provider?: string;
    /** More of the fake PC, over the common data. */
    data?: FakeClientData;
    /** Opens the Model pane on the success notice for this just-added model, with the Hugging Face section open. */
    addedModel?: string;
    /** Puts a device prompt in this state before the pane shows, as the PC's events or a refused request would. */
    prompt?: { kind: DevicePromptKind; action: string; state: DevicePromptState; note?: DevicePromptNote };
    /** Opens the cloud key field (with Replace already pressed when `replacing`), with `typed` in it and Connect pressed when `submit`. */
    keyEntry?: { replacing?: boolean; typed?: string; submit?: boolean };
    /** Opens the models search field with this text typed in. */
    search?: string;
    /** Opens this model's Details section expanded. */
    openDetails?: string;
    /** Opens Add a model from Hugging Face with this link typed and its check still running. */
    checkPending?: string;
    /** Opens Add a model from Hugging Face with this link already checked. */
    customReport?: CustomModelReport;
    /** Opens the Messaging status with the just-paired line showing. */
    justPaired?: boolean;
    /** An action that never finishes, so its in-flight state stays on screen: tap its button (`#tap=model-download-<id>` or `#tap=model-use-<id>`). */
    hang?: 'download' | 'select';
    /** Client calls the scene answers itself (a hang or a PC refusal), over the fake's. */
    override?: Partial<GaiaClient>;
    /** Shows the "Back to {section}" link a deep link from that section gets (needs `target`). */
    from?: SectionId;
    /** Renders the pane inside the section's error boundary, with a pane that throws. */
    crash?: boolean;
    /** Opens Permissions with the full-access confirm sheet already up. */
    confirmFullAccess?: boolean;
    /** Opens Automations already asking to remove the automation with this id. */
    confirmRemove?: string;
    /** Opens Skills with the Add skills sheet already up. */
    skillsAdd?: boolean | SkillsAddSeed;
    /** Covers the screen as an English to Arabic pick would, with this platform's buttons, whatever the device is. */
    languageSwitch?: 'android' | 'ios';
    /** The language the cover is for; Arabic when unset. */
    languageSwitchTo?: string;
    /** The cover for a language changed in system Settings: Close only. */
    languageSwitchSystem?: boolean;
    /** The device's saved palette; scenes without one open on the default palette. */
    appearance?: { palette: 'default' | 'custom'; custom: { accent: string; base: string } };
}

const APPLY: GpuMemoryStatus = { ...GPU, os: 'linux', method: 'apply', method_reason: '', setting: { name: 'amdgpu.gttsize', current_gb: 16, min_gb: 4, max_gb: 96 } };

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
const MANY = [HAVE, WANT, WANT_SMALL, ...['A', 'B', 'C', 'D', 'E'].map((n) => model(`Extra-${n}-GGUF`, { display_name: `Extra model ${n}`, size_gb: 1.5, fits: true }))];
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
const NPU_READY = { ...NPU_MODEL, npu_problems: undefined, evidence: '17/20 tasks · quality 4.4/5 · $0.00 per 20-task run' };
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
        { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: tEn('providers.fireworks.notice'), configured: fireworksConfigured, blocked: false },
        { id: 'amd', name: 'AMD LLM Gateway', remote: true, privacy_notice: tEn('providers.amd.notice'), configured: false, blocked: false },
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
    checks: [{ id: 'chat', label: 'Chat model', ok: true, detail: 'Has a chat template' }, { id: 'fit', label: 'Fits this PC', ok: true, detail: 'Needs 4.6 GB' }],
    warnings: [], variants: [],
};
const HF_VARIANTS = [
    { quant: 'Q4_K_M', file: 'Demo-Chat-Q4_K_M.gguf', size_gb: 3.4, fits: true, reason: null },
    { quant: 'Q8_0', file: 'Demo-Chat-Q8_0.gguf', size_gb: 6.1, fits: true, reason: null },
];
const HF_CHECKING: CustomModelReport = {
    ...HF_REPORT, ok: false, variants: HF_VARIANTS,
    checks: [{ id: 'chat', label: 'Chat model', ok: true, detail: 'Has a chat template' }, { id: 'fit', label: 'Fits this PC', ok: false, detail: 'Needs 64 GB' }],
};

const SPEECH: NonNullable<FakeClientData['speechSettings']> = {
    voice: 'af_heart', speed: 100, auto: false, min_speed: 50, max_speed: 200,
    voices: [
        { id: 'af_heart', name: 'Heart', accent: 'american', gender: 'female', quality: 'A' },
        { id: 'am_adam', name: 'Adam', accent: 'american', gender: 'male', quality: 'B' },
        { id: 'bf_emma', name: 'Emma', accent: 'british', gender: 'female', quality: 'A' },
    ],
};
const blockedProviders: NonNullable<FakeClientData['providers']> = {
    providers: [
        { id: 'local', name: 'Local', remote: false, privacy_notice: '', configured: true, blocked: false },
        { id: 'fireworks', name: 'Fireworks AI', remote: true, privacy_notice: tEn('providers.fireworks.notice'), configured: true, blocked: true },
    ],
    lemonade_error: null,
};

const never = () => new Promise<never>(() => undefined);
const refused = () => Promise.reject(new GaiaApiError(403, PC_ONLY_REFUSAL));
const TYPED_KEY = 'fw-demo-key-0000';
// The PC's error echoes the key, so the scene shows it masked on the detail line.
const keyRejected = () => Promise.reject(new GaiaApiError(502, `Fireworks AI rejected the key ${TYPED_KEY}: 401 Unauthorized.`));
// The PC's answers to a paired phone, as the providers router words them.
const keyRefusedAway = () => Promise.reject(new GaiaApiError(403, 'Enter provider keys on the PC running GAIA or on a paired device the PC allowed, not over mobile access.'));
const storeLocked = () => Promise.reject(new GaiaApiError(423, 'The credential store on the PC running GAIA could not be used. Unlock or fix it on the PC, then try again.'));
const keyScene = (scene: Partial<SettingsScene>): SettingsScene => ({ section: 'model', target: 'cloud-key', provider: 'fireworks', gpuMemory: GPU, ...scene });
// Fireworks as the PC's list reports its key; the hint is fixture data, never a real key's.
const keyFields = (fireworks: Partial<ProviderSummary>): SettingsScene => {
    const list = providers(!!fireworks.configured);
    const fields = { key_source: null, key_state: 'read', key_hint: null, known_models: false, ...fireworks } as const;
    return keyScene({
        data: {
            providers: { ...list, providers: list.providers.map((p) => (p.id === 'fireworks' ? { ...p, ...fields } : p)) },
            providerModels: { fireworks: { provider: 'fireworks', models: [] } },
        },
    });
};

const discord = (extra: Partial<DiscordStatus>): DiscordStatus => ({
    connected: true, paired: false, running: true, state: 'stopped', detail: '', bot_name: 'GAIA Helper', owner_name: '', autostart: false,
    always_allowed: [], model: '', portal_url: 'https://discord.com/developers/applications', bot_page_url: 'https://discord.com/developers/applications/1/bot',
    invite_url: 'https://discord.com/oauth2/authorize?client_id=1', bot_profile_url: 'https://discord.com/users/1', pairing_code: '', pairing_expires_at: 0,
    discord_installed: false, should_offer_setup: false, ...extra,
});
const NO_TOKEN = { connected: false, bot_name: '', bot_profile_url: '', invite_url: '' };
const NEXT_AT = Date.UTC(2026, 10, 17, 9, 0) / 1000;
const automation = (id: string, name: string, extra: Partial<Automation>): Automation => ({
    id, name, kind: 'reminder', heartbeat: false, paused: false, every_seconds: 0, next_at: NEXT_AT, last_run_at: 0, runs: 0,
    prompt: '', say: '', check: '', quiet: '', days: '', failures: 0, ...extra,
});
const AUTOMATIONS: Automation[] = [
    automation('a1b2c3d4', 'Call Sam', { say: 'Call Sam about the venue.' }),
    automation('b2c3d4e5', 'Inbox digest', { kind: 'summary', every_seconds: 86400, prompt: 'Summarize what came into my inbox today.', quiet: '22:00-07:00', days: 'mon,tue,wed,thu,fri', runs: 12 }),
    automation('c3d4e5f6', 'CI on main', { kind: 'trigger', every_seconds: 900, check: 'gh run list --branch main --limit 1 --json conclusion', say: 'CI on main is red.', failures: 2 }),
    automation('d4e5f6a7', 'Heartbeat', { kind: 'alert', heartbeat: true, every_seconds: 1800, prompt: 'Check my calendar and the open pull requests.' }),
    automation('e5f6a7b8', 'Rainier weather', { kind: 'alert', every_seconds: 3600, prompt: 'Tell me if the Rainier forecast drops below freezing.', paused: true, days: 'sat,sun' }),
];
const autos = (list: AutomationList | Error, scene: Partial<SettingsScene> = {}): SettingsScene => ({ section: 'automations', gpuMemory: GPU, data: { automations: list }, ...scene });

const msg = (status: DiscordStatus | Error, scene: Partial<SettingsScene> = {}): SettingsScene => ({ section: 'messaging', gpuMemory: GPU, data: { discordStatus: status }, ...scene });

const SERVER: ModelServerInfo = {
    reachable: true, owner: 'gaia', version: '10.8.1', base_url: 'http://127.0.0.1:13305',
    chat_model: { name: CHAT_MODEL, backend: 'vulkan', device: 'gpu', recipe: 'llamacpp', ctx_size: 65536, model_type: 'llm' },
    embedding_model: { name: 'nomic-embed-text-v2-moe-GGUF', backend: 'cpu', device: 'cpu', recipe: 'llamacpp', ctx_size: 2048, model_type: 'embedding' },
    loaded_models: [
        { name: CHAT_MODEL, backend: 'vulkan', device: 'gpu', recipe: 'llamacpp', ctx_size: 65536, model_type: 'llm' },
        { name: 'nomic-embed-text-v2-moe-GGUF', backend: 'cpu', device: 'cpu', recipe: 'llamacpp', ctx_size: 2048, model_type: 'embedding' },
        { name: 'Whisper-Large-v3-Turbo', backend: 'cpu', device: 'cpu', recipe: 'whispercpp', model_type: 'transcription' },
        { name: 'SDXL-Turbo', backend: 'cpu', device: 'cpu', recipe: 'sd-cpp', model_type: 'image' },
        { name: 'bge-reranker-v2-m3-GGUF', backend: 'cpu', device: 'cpu', recipe: 'llamacpp', model_type: 'reranking' },
        { name: 'kokoro-v1', backend: 'cpu', device: 'cpu', recipe: 'kokoro', model_type: 'tts' },
    ],
    available_backends: [{ name: 'vulkan', state: 'installed' }], preferred_backend: 'vulkan', default_backend: 'vulkan',
};
const TARGET = COMMON.lemonadeTarget as LemonadeTarget;
const server = (info: Partial<ModelServerInfo>, target: Partial<LemonadeTarget> = {}, scene: Partial<SettingsScene> = {}): SettingsScene => ({
    section: 'advanced', target: 'model-server', gpuMemory: GPU, ...scene,
    data: { modelServer: { ...SERVER, ...info }, lemonadeTarget: { ...TARGET, ...target }, ...scene.data },
});
const SETTINGS: Settings = {
    custom_model: null, model_status: null, context_size: null, dynamic_tools: false, dynamic_tools_locked: false,
    agent_mode: 'manual', network_policy: 'cloud_allowed',
};
const advanced = (settings: Partial<Settings>, mcp?: MCPServerStatus[]): SettingsScene => ({
    section: 'advanced', gpuMemory: GPU, data: { settings: { ...SETTINGS, ...settings }, ...(mcp ? { mcpServers: mcp } : {}) },
});
const MCP_OK: MCPServerStatus[] = [
    { name: 'filesystem', connected: true, tool_count: 1, error: null },
    { name: 'github', connected: true, tool_count: 12, error: null },
];
const MCP_FAILED: MCPServerStatus[] = [
    ...MCP_OK,
    { name: 'jira', connected: false, tool_count: 0, error: 'spawn jira-mcp ENOENT' },
];

// The Advanced status card on a running PC; each ADV scene changes only what it shows.
const RUNNING = {
    lemonade_running: true, lemonade_error: null, lemonade_version: '10.8.1', start_command: null, start_instruction: null, version: '0.26.0',
    model_loaded: CHAT_MODEL, expected_model_loaded: true, context_size_sufficient: true, model_context_size: 65536, embedding_model_loaded: true,
    disk_space_gb: 120, memory_available_gb: 40, initialized: true, download_progress: null, default_model_name: CHAT_MODEL, default_model_size_gb: 5.97,
    model_downloaded: true, model_size_gb: 5.97, model_device: 'gpu', model_labels: ['chat', 'vision', 'tool-calling'], gpu_name: 'AMD Radeon 8060S',
    gpu_vram_gb: 32, processor_name: 'AMD Ryzen AI Max+ 395',
} as unknown as SystemStatus;
const running = (patch: Partial<SystemStatus>): SettingsScene => ({ section: 'advanced', gpuMemory: GPU, status: { ...RUNNING, ...patch } as SystemStatus });

const chat = (id: string): Session => ({ id, title: `Chat ${id}`, created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z' }) as Session;
const LINK_URL = 'https://github.com/acme/skills';
const linkSkill = (name: string, extra: Partial<LinkSkill>): LinkSkill => ({
    name, description: `${name} helps with a task.`, path: name, has_code: false, permissions: [], permissions_unreadable: false,
    verdict: 'ALLOW', findings: [], installed: false, update: false, error: null, ...extra,
}) as unknown as LinkSkill;
const LINK_PREVIEW: LinkPreview = {
    link: LINK_URL, source: 'acme/skills', pin: 'f3a9c2', warning: 'Only add skills from people you trust.',
    skills: [
        linkSkill('release-notes', {}),
        linkSkill('docs-lookup', { has_code: true, verdict: 'REVIEW', findings: ['Runs scripts/fetch.py'] }),
        linkSkill('changelog', { installed: true, update: true }),
        linkSkill('shell-helper', { installed: true }),
        linkSkill('crypto-miner', { error: 'The audit blocked it.', verdict: 'BLOCK' }),
        linkSkill('broken', { error: 'SKILL.md could not be read.', verdict: 'ERROR' }),
    ],
};
const LINK_ADDED: LinkAddResult = {
    added: [
        { name: 'release-notes', updated: false, verdict: 'ALLOW', has_code: false, findings: [] },
        { name: 'docs-lookup', updated: false, verdict: 'REVIEW', has_code: true, findings: [] },
        { name: 'changelog', updated: true, verdict: 'ALLOW', has_code: false, findings: [] },
    ],
    failed: { 'shell-helper': 'A skill with this name is already installed from somewhere else.' },
};
const linkScene = (skillsAdd: SkillsAddSeed): SettingsScene => ({
    section: 'skills', gpuMemory: GPU, skillsAdd,
    data: { skills: { skills: [skill('summarize')], invalid: {} }, linkPreview: () => LINK_PREVIEW, linkAdd: () => LINK_ADDED },
});
const skill = (name: string): SkillInfo => ({ name, description: 'Summarize a document.', version: '1.0', tier: null, tools: [], path: `skills/${name}`, source: 'agent-bundled' }) as SkillInfo;

const PERM_CHATS: FakeClientData = {
    sessions: [chat('a'), chat('b'), chat('c')],
    permissions: { a: 'full_access', b: 'ask', c: 'ask' },
    permissionGrants: {
        a: [{ key: 'shell:git status', label: 'git status' }],
        b: [{ key: 'shell:npm test', label: 'npm test' }, { key: 'shell:ls', label: 'ls' }],
        c: [{ key: 'write:notes.md', label: 'notes.md' }],
    },
    defaultPermissionMode: 'ask',
};
export const SETTINGS_SCENES: Record<string, SettingsScene> = {
    'advanced-not-installed': { section: 'advanced', gpuMemory: GPU, status: NOT_INSTALLED },
    'gpu-adjustable': { section: 'model', target: 'gpu-memory', gpuMemory: GPU },
    'gpu-adjustable-setup': { section: 'setup', gpuMemory: GPU },
    // Linux, where GAIA writes the size itself: the sizes, Apply (asks first), and Undo once GAIA has changed it.
    'gpu-apply': { section: 'model', target: 'gpu-memory', gpuMemory: APPLY },
    'gpu-apply-undo': { section: 'model', target: 'gpu-memory', gpuMemory: { ...APPLY, revert: { available: true, previous_setting_gb: 16 } } },
    // Apply confirmed and the PC's administrator prompt up: "Approve on your PC" in place of Apply.
    'gpu-apply-waiting': { section: 'model', target: 'gpu-memory', gpuMemory: APPLY, prompt: { kind: 'admin', action: 'gpuMemoryApply', state: 'waiting' } },
    'gpu-apply-failed': {
        section: 'model', target: 'gpu-memory', gpuMemory: APPLY,
        prompt: { kind: 'admin', action: 'gpuMemoryApply', state: 'failed', note: { detail: 'GAIA could not change the GPU memory setting. Check the PC for details.' } },
    },
    'gpu-pending': { section: 'model', target: 'gpu-memory', gpuMemory: PENDING },
    'gpu-read-error': { section: 'model', target: 'gpu-memory', gpuMemory: READ_ERROR },
    'gpu-read-error-setup': { section: 'setup', gpuMemory: READ_ERROR },
    // SET-MODEL-12: a cloud provider with no connected key shows Reconnect.
    'model-key-disconnected': keyFields({ configured: false, key_source: 'stored', key_hint: '4f2a' }),
    // SET-MODEL-15: the key field, Connect disabled until text is typed (`#tap=provider-key-connect` after typing connects on the fake PC).
    'model-key-entry': keyScene({}),
    // SET-MODEL-15: a typed key sent and the PC still answering: the field cleared, Connect busy.
    'model-key-connecting': keyScene({ keyEntry: { typed: TYPED_KEY, submit: true }, override: { connectProvider: never } }),
    // SET-MODEL-15: the PC's error under the sentence, with the key it echoed masked.
    'model-key-failed': keyScene({ keyEntry: { typed: TYPED_KEY, submit: true }, override: { connectProvider: keyRejected } }),
    // SET-MODEL-15: the PC refuses a typed key from a phone (403): "Change this on the PC" in place of the field.
    'model-key-pc-only': keyScene({ keyEntry: { typed: TYPED_KEY, submit: true }, override: { connectProvider: keyRefusedAway } }),
    // SET-MODEL-18: the PC's OS key store is locked (423): the warning, the PC's sentence on the detail line, and Try again.
    'model-key-locked': keyScene({ keyEntry: { typed: TYPED_KEY, submit: true }, override: { connectProvider: storeLocked } }),
    // SET-MODEL-14: a connected provider's Remove key asking first (`#tap=provider-key-remove` opens the confirm sheet).
    'model-key-remove': keyScene({ data: cloud([]) }),
    // SET-MODEL-13: a connected provider with Replace pressed: "Paste your new key", Save key, Cancel.
    'model-key-replace': keyScene({ keyEntry: { replacing: true }, data: cloud([]) }),
    // SET-MODEL-11: a saved key on the PC: 20 bullets and its last four, with Replace and Remove.
    'model-key-stored': keyFields({ configured: true, key_source: 'stored', key_hint: '4f2a' }),
    // SET-MODEL-10: a saved key that isn't connected: "has your key but is not connected yet" and Reconnect.
    'model-key-saved-disconnected': keyFields({ configured: false, key_source: 'stored', key_hint: '4f2a' }),
    // SET-MODEL-10: a key from the PC's environment: no Replace or Remove.
    'model-key-env': keyFields({ configured: true, key_source: 'environment', key_hint: '9c1e', env_var: 'FIREWORKS_API_KEY', key_from_gaia_env: false }),
    // SET-MODEL-10: an environment key GAIA's own env file set: Replace shows, Remove doesn't.
    'model-key-env-gaia': keyFields({ configured: true, key_source: 'environment', key_hint: '9c1e', env_var: 'FIREWORKS_API_KEY', key_from_gaia_env: true }),
    // SET-MODEL-10: the PC's provider error line, our sentence with the PC's words on a detail line under it.
    'model-key-error': keyFields({ configured: false, key_source: 'stored', key_hint: '4f2a', error: 'HTTP 401: invalid api key' }),
    // SET-MODEL-10: a key Lemonade already holds, shown masked like a saved one.
    'model-key-lemonade': keyFields({ configured: true, key_source: 'lemonade', key_hint: '7b3d' }),
    // SET-MODEL-10: GAIA on the PC hasn't read its key store since it started: "Waiting for the OS…".
    'model-key-unknown': keyFields({ configured: false, key_state: 'unknown' }),
    // SET-MODEL-18: the PC's list says its key store is locked, before anything is sent: the warning and Try again.
    'model-key-store-locked': keyFields({ configured: false, key_state: 'store_locked' }),
    // SET-MODEL-18: Try again pressed and the PC's unlock prompt is up: "Approve on your PC" with Stop waiting, in place of the button.
    'model-key-locked-waiting': { ...keyFields({ configured: false, key_state: 'store_locked' }), prompt: { kind: 'keyStore', action: 'keyStoreRetry', state: 'waiting' } },
    // SET-MODEL-18: Try again pressed within 10 s of the last try: "Wait a few seconds", and Try again stays.
    'model-key-locked-too-soon': { ...keyFields({ configured: false, key_state: 'store_locked' }), prompt: { kind: 'keyStore', action: 'keyStoreRetry', state: 'tooSoon' } },
    // SET-MODEL-18: the PC is already waiting on another request: no Try again on the notice, the button stays.
    'model-key-locked-busy': { ...keyFields({ configured: false, key_state: 'store_locked' }), prompt: { kind: 'keyStore', action: 'keyStoreRetry', state: 'busy' } },
    // SET-MODEL-11: a saved key with no hint, as over the tunnel: the 20 bullets alone in the saved-key row.
    'model-key-no-hint': keyFields({ configured: true, key_source: 'stored', key_hint: null }),
    // SET-MODEL-19: Fireworks can't list its models, so the PC serves the ones it knows.
    'model-models-stale': keyFields({ configured: true, key_source: 'stored', key_hint: '4f2a', known_models: true }),
    // SET-MODEL-20: a cloud list with nothing in it says "No models match."; typing a miss into `model-search` shows the same on the local list.
    'model-search-empty': { section: 'model', target: 'models-on-pc', provider: 'fireworks', gpuMemory: GPU, data: cloud([]) },
    'model-local-empty': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([]) },
    // SET-MODEL-22: the local groups (Downloaded, Available to download) and, below, Fireworks' recommended picks with their benchmark note.
    'model-available': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, WANT, WANT_SMALL]) },
    'model-fireworks': { section: 'model', target: 'models-on-pc', provider: 'fireworks', gpuMemory: GPU, data: cloud(FIREWORKS_MODELS) },
    // SET-MODEL-23: the group is closed until tapped (`#tap=model-group-header-unavailable`).
    'model-unavailable': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, NEVER]) },
    // SET-MODEL-31: the Downloads panel (`local-downloads`) while a setup download runs.
    'model-setup-downloads': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: { ...local([HAVE, WANT]), setupStatus: RUN } },
    // SET-MODEL-24, 25: a row downloading, and a Download tap that hangs (`#tap=model-download-Llama-3.2-3B-Instruct-GGUF`) with every button disabled.
    'model-downloading': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, hang: 'download',
        data: local([HAVE, model(WANT.id, { ...WANT, download_progress: { model_name: WANT.id, state: 'downloading', percent: 42, downloaded_bytes: 9.8e9, total_bytes: 23.3e9, file: null, file_index: 1, total_files: 1, message: null } }), WANT_SMALL]),
    },
    // SET-MODEL-20: eight models, so the search field shows (`model-search`); the same with a miss typed into it.
    'model-many': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local(MANY) },
    'model-search-miss': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, search: 'zzz-no-such-model', data: local(MANY) },
    // SET-MODEL-24: a model row with its Details section expanded.
    'model-details': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, openDetails: MINE_CUSTOM.id, data: local([HAVE, MINE_CUSTOM]) },
    // SET-MODEL-24: an NPU model's Details (placement marked expected, then the measured figures); and a model the PC can't run, its group held open by a search.
    'model-details-npu': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, openDetails: NPU_READY.id,
        data: local([HAVE, NPU_READY]),
    },
    'model-details-unfit': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, openDetails: NEVER.id, search: 'Coder', data: local([HAVE, NEVER]) },
    // SET-MODEL-26: a Use tap that hangs (`#tap=model-use-user.my-tuned-GGUF`).
    'model-switching': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, hang: 'select', data: local([HAVE, MINE_CUSTOM]) },
    // SET-MODEL-24, 28: a custom model with Remove and its Details (`#tap=model-remove-user.my-tuned-GGUF` opens the confirm sheet); the custom model in use has none.
    'model-custom': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU,
        data: { ...local([MINE_IN_USE, MINE_CUSTOM, HAVE]), activeModel: { ...COMMON.activeModel!, model: MINE_IN_USE.id, display_name: MINE_IN_USE.display_name } },
    },
    // SET-MODEL-33: Qwen is downloaded and is not the chat default, so its Remove shows: `#tap=local-models-toggle,local-remove-Qwen3.6-35B-A3B-GGUF` opens the confirm.
    'model-local-remove': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU,
        data: { ...local([HAVE, WANT]), setupPlan: { ...COMMON.setupPlan!, catalog: (COMMON.setupPlan!.catalog ?? []).map((e) => (e.id === WANT.id ? { ...e, downloaded: true, fits: true } : e)) } },
    },
    // SET-MODEL-29: an NPU model whose setup is not ready.
    'model-npu-not-ready': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE, NPU_MODEL]) },
    // SET-MODEL-30: opens on the success notice after a Hugging Face add, the section open and the new row listed.
    'model-hf-added': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, addedModel: HF_REPORT.display_name!,
        data: { ...local([HAVE, model(HF_REPORT.model_id!, { display_name: HF_REPORT.display_name!, custom: true, size_gb: HF_REPORT.size_gb, source_url: HF_URL })]), customReports: { [HF_URL]: HF_REPORT } },
    },
    // SET-MODEL-30: the link checked, with its checks and a quantization choice, and nothing to add yet; then the same link passing, with the Add button.
    'model-hf-checking': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, customReport: HF_CHECKING,
        data: local([HAVE]),
    },
    // SET-MODEL-30: the Check spinner, with the check in flight and nothing listed yet.
    'model-hf-check-running': { section: 'model', target: 'models-on-pc', gpuMemory: GPU, checkPending: HF_URL, data: local([HAVE]) },
    // SET-MODEL-30: the checks done and passing, with a non-blocking Warnings list under them.
    'model-hf-warnings': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, data: local([HAVE]),
        customReport: { ...HF_REPORT, warnings: ['Not tested on the NPU', 'The file is larger than most chat models'], variants: HF_VARIANTS },
    },
    'model-hf-ready': {
        section: 'model', target: 'models-on-pc', gpuMemory: GPU, customReport: { ...HF_REPORT, variants: HF_VARIANTS },
        data: local([HAVE]),
    },
    // SET-MODEL-36 to 38: the cloud spending block (`cloud-spending`) under a connected cloud provider.
    'spend-total': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ limit_usd: 20, state: 'ok', unpriced_turns: 2, unreported_turns: 1 }) } },
    'spend-near-limit': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ total_usd: 17.4, limit_usd: 20, state: 'near' }) } },
    'spend-over-limit': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { ...cloud([]), spending: spent({ total_usd: 20.3, limit_usd: 20, state: 'reached' }) } },

    // Automations: one of each kind with a paused one, the remove sheet, the delivery notices, empty, a failed read, and an older PC that refuses a phone.
    'automations-list': autos({ automations: AUTOMATIONS, delivers: true }),
    'automations-remove': autos({ automations: AUTOMATIONS, delivers: true }, { confirmRemove: 'b2c3d4e5' }),
    'automations-no-delivery': autos({ automations: AUTOMATIONS, delivers: false }),
    'automations-delivery-unknown': autos({ automations: AUTOMATIONS, delivers: null }),
    'automations-empty': autos({ automations: [], delivers: false }),
    'automations-load-failed': autos(new GaiaApiError(500, 'automations.json is not usable: Expecting value: line 1 column 1 (char 0)')),
    'automations-pc-refused': autos(new GaiaApiError(403, PC_ONLY_REFUSAL)),
    'automations-loading': autos({ automations: [], delivers: true }, { override: { listAutomations: never } }),
    // Pause on Call Sam never finishes: tap `#tap=automation-toggle-a1b2c3d4` and its button shows busy while Remove is disabled.
    'automations-busy': autos({ automations: AUTOMATIONS, delivers: true }, { override: { automationAction: never } }),
    // Pause on Call Sam fails: tap `#tap=automation-toggle-a1b2c3d4` and the danger notice shows with the PC's text on its own detail line.
    'automations-action-error': autos({ automations: AUTOMATIONS, delivers: true }, { override: { automationAction: () => Promise.reject(new GaiaApiError(500, 'scheduler.json is locked by another process')) } }),

    // SET-MSG-01: the card before the PC has answered, and when the read fails (`Try again`).
    'msg-loading': msg(discord({}), { override: { getDiscordStatus: never } }),
    'msg-load-failed': msg(new GaiaApiError(500, 'The messaging service is not running.')),
    // The PC refuses the read for a phone: the steps to follow at the PC, with PC-only buttons (`#tap=messaging-connect` explains).
    'msg-pc-refused': msg(new GaiaApiError(403, PC_ONLY_REFUSAL)),
    // SET-MSG-01, 08: no bot yet (steps 1 and 2), and a token Discord or GAIA can't use.
    'msg-needs-token': msg(discord({ ...NO_TOKEN, running: false })),
    'msg-token-invalid': msg(discord({ state: 'token_invalid' })),
    'msg-conflict': msg(discord({ ...NO_TOKEN, state: 'conflict', running: false })),
    'msg-credentials': msg(discord({ state: 'credentials_unavailable', detail: 'The OS key store refused the request.' })),
    // SET-MSG-08, 09: stopped (Start), crashed (stopped with autostart on), an error (Start, with its detail), and another PC answering (Answer from this PC).
    'msg-stopped': msg(discord({ state: 'stopped' })),
    'msg-crashed': msg(discord({ state: 'stopped', autostart: true })),
    'msg-error': msg(discord({ state: 'error', detail: 'discord.errors.LoginFailure: Improper token has been passed.' })),
    'msg-taken-over': msg(discord({ state: 'taken_over' })),
    'msg-starting': msg(discord({ state: 'starting', running: false })),
    // SET-MSG-05, 06: steps 3 and 4 with the pairing code (`#tap=messaging-copy-code` shows Copied); the same with no code yet.
    'msg-pairing': msg(discord({ state: 'pairing', pairing_code: 'DUMY2345', pairing_expires_at: 1900000000 })),
    'msg-pairing-waiting': msg(discord({ state: 'pairing' })),
    // SET-MSG-11: the line shown just after pairing, seeded so it needs no wait.
    'msg-paired-now': msg(discord({ state: 'connected', paired: true, owner_name: 'Alex', model: CHAT_MODEL }), { justPaired: true }),
    // SET-MSG-11, 13: paired and answering, with the Disconnect button (`#tap=messaging-disconnect` explains it is the PC's to press).
    'msg-paired': msg(discord({ state: 'connected', paired: true, owner_name: 'Alex', model: CHAT_MODEL, always_allowed: ['Run shell commands'] })),

    // SET-ADV-13, 14, 15, 16, 17: the model server section (opens on load): GAIA's own server with the chat, embedding and each other kind of loaded model (`#tap=advanced-reload` shows the reloading notice).
    'adv-server-loaded': server({}),
    'adv-server-checking': server({}, {}, { override: { getModelServer: never } }),
    'adv-server-error': server({}, {}, { override: { getModelServer: () => Promise.reject(new GaiaApiError(500, 'Connection refused')) } }),
    'adv-server-pc-only': server({}, {}, { override: { getModelServer: refused } }),
    'adv-server-unreachable': server({ reachable: false, error: 'connect ECONNREFUSED 127.0.0.1:13305' }),
    'adv-server-none-loaded': server({ chat_model: null, embedding_model: null, loaded_models: [] }),
    // SET-ADV-15: the backend a Lemonade lists but has not downloaded, none to choose, and a saved backend to switch back from (tap the "Vulkan" segment for the Saved notice).
    'adv-server-backend-installable': server({ available_backends: [{ name: 'vulkan', state: 'installable' }] }),
    'adv-server-no-backends': server({ available_backends: [], preferred_backend: null, default_backend: null }),
    'adv-server-backend-switch': server({ preferred_backend: 'cpu' }),
    // SET-ADV-17: which server GAIA uses: its own, yours, set by LEMONADE_BASE_URL, an ignored env address, and a failed read.
    'adv-target-own': server({}),
    'adv-target-yours': server({ owner: 'user', base_url: 'http://192.168.1.20:13305' }, { mode: 'external', base_url: 'http://192.168.1.20:13305', saved_base_url: 'http://192.168.1.20:13305' }),
    'adv-target-env': server({ owner: 'user', base_url: 'http://10.0.0.5:13305' }, { mode: 'external', source: 'env', base_url: 'http://10.0.0.5:13305' }),
    'adv-target-env-ignored': server({}, { env_url_ignored: 'http://10.0.0.5:13305' }),
    'adv-target-error': server({}, {}, { override: { getLemonadeTarget: () => Promise.reject(new GaiaApiError(500, 'Target unreadable')) } }),
    // SET-ADV-20: the Custom model ID card is closed until tapped (`#tap=advanced-custom-toggle`): empty, a saved ID the server lists, one it doesn't, one it couldn't check, and refused.
    'adv-custom-empty': advanced({}),
    'adv-custom-saved': advanced({ custom_model: 'Qwen3-4B-Instruct-2507-GGUF', model_status: { checked: true, found: true, downloaded: true, loaded: false } }),
    'adv-custom-unlisted': advanced({ custom_model: 'user.missing-GGUF', model_status: { checked: true, found: false, downloaded: false, loaded: false } }),
    'adv-custom-unchecked': advanced({ custom_model: 'user.maybe-GGUF', model_status: { checked: false, found: false, downloaded: false, loaded: false } }),
    'adv-custom-pc-only': { section: 'advanced', gpuMemory: GPU, data: { settings: SETTINGS }, override: { getSettings: refused } },
    // SET-ADV-21: Dynamic tools, closed until tapped (`#tap=advanced-dynamic-toggle`): on, and locked by GAIA_DYNAMIC_TOOLS.
    'adv-dynamic-on': advanced({ dynamic_tools: true }),
    'adv-dynamic-locked': advanced({ dynamic_tools: true, dynamic_tools_locked: true }),
    // SET-ADV-22: MCP servers: open when one failed, and closed until tapped when all connected (`#tap=advanced-mcp-toggle`).
    'adv-mcp-failed': advanced({}, MCP_FAILED),
    'adv-mcp-ok': advanced({}, MCP_OK),

    // SET-ADV-06, 07: the status card's model actions: not downloaded (Download), another model loaded or a window too small (Load model).
    'adv-not-downloaded': running({ model_loaded: null, model_downloaded: false }),
    'adv-wrong-model': running({ model_loaded: 'Llama-3.2-3B-Instruct-GGUF', expected_model_loaded: false }),
    'adv-small-context': running({ context_size_sufficient: false, model_context_size: 4096 }),
    // SET-ADV-08: More details is closed until opened (`#expand`); the second warns on a CPU device and a small window.
    'adv-details': running({}),
    'adv-details-warn': running({ model_device: 'cpu', context_size_sufficient: false, model_context_size: 4096 }),
    // SET-ADV-10: the PC doesn't answer the status read.
    'adv-unreachable': { ...running({}), override: { getSystemStatus: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200', new Error('Network request failed'))) } },

    // SET-PERM-01, PRM-24: the lede and the default-mode switch. `#tap=permissions-default-switch`, then "Turn on full access for new chats": the PC refuses a phone, so the switch stays off and the PC-only notice shows.
    'perm-default': { section: 'permissions', gpuMemory: GPU, data: { sessions: [], defaultPermissionMode: 'ask', defaultModePcOnly: true } },
    // SET-PERM-03: the full-access warning confirm, open on arrival (the same sheet `#tap=permissions-default-switch` opens).
    'perm-full-confirm': { section: 'permissions', gpuMemory: GPU, confirmFullAccess: true, data: { sessions: [], defaultPermissionMode: 'ask' } },
    // SET-PERM-05: Chats with extra access, seeded with a full-access chat, a chat with two grants and one with one grant.
    // SET-PERM-06: `#tap=perm-chat-menu-a,perm-chat-turn-off-full`. SET-PERM-07: `#tap=perm-grant-revoke-a-0` (grant index within the chat; Chat b's second is `perm-grant-revoke-b-1`).
    // SET-PERM-08: `#tap=perm-chat-menu-b,perm-chat-revoke-all`.
    'perm-chats': { section: 'permissions', gpuMemory: GPU, data: PERM_CHATS },
    // SET-VOICE-03: Preview; `#tap=read-aloud-preview` starts a preview that never finishes, so the button reads Stop reading beside a spinner (no audio plays).
    'voice-preview': { section: 'voice', gpuMemory: GPU, data: { speechSettings: SPEECH }, override: { speak: never } },
    // SET-MODEL-08: Fireworks blocked by Local only, shown on its own tab.
    'model-local-only-blocked': { section: 'model', provider: 'fireworks', gpuMemory: GPU, data: { providers: blockedProviders } },
    // SET-MODEL-09: the providers call fails; the notice has Check again.
    'model-providers-offline': { section: 'model', gpuMemory: GPU, override: { listProviderSummaries: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200/api/providers', new Error('Network request failed'))) } },
    // SET-NAV-04: Model opened from Privacy on the Cloud key row: "Back to Privacy" shows under the header and the target flashes.
    'nav-back-link': { section: 'model', target: 'cloud-key', provider: 'fireworks', from: 'privacy', gpuMemory: GPU },
    // SET-NAV-05: a pane that throws: the section's error fallback with Try again and Reload.
    'nav-crash': { section: 'general', crash: true, gpuMemory: GPU },

    // SET-SKILL-11: skills the PC could not read, under the list.
    'skills-skipped': {
        section: 'skills', gpuMemory: GPU,
        data: {
            skills: {
                skills: [skill('summarize')],
                invalid: {
                    'skills/long-one': 'description is 2048 characters, over the limit',
                    'skills/bare': "'description' is missing",
                    'skills/odd': 'not valid YAML',
                },
            },
        },
    },
    // Add skills from a link: a mix of new, update, review, code, blocked, elsewhere and unreadable skills; code unticked.
    'skills-link-mix': linkScene({ read: LINK_URL }),
    // The same link with Include skills with code ticked: the code skills can be picked.
    'skills-link-code': linkScene({ read: LINK_URL, allowCode: true }),
    // What was added, updated and not added.
    // Add pressed with a code skill picked: the stacked "Add skills that run code?" confirm.
    'skills-link-confirm': linkScene({ read: LINK_URL, allowCode: true, confirm: true }),
    'skills-link-result': linkScene({ read: LINK_URL, allowCode: true, add: true }),
    'skills-add': { section: 'skills', gpuMemory: GPU, skillsAdd: true, data: { skills: { skills: [skill('summarize')], invalid: {} } } },
    // SET-GEN-04 to 07: a saved custom accent and tint, so Custom is selected and the Colors disclosure opens with Accent, Background tint and Reset.
    'general-custom-colors': { section: 'general', gpuMemory: GPU, appearance: { palette: 'custom', custom: { accent: '#C2410C', base: '#44403C' } } },
    // The full-screen cover after an English to Arabic pick (Android has Close and Cancel; iOS only Cancel).
    'lang-switch-ar-android': { section: 'general', gpuMemory: GPU, languageSwitch: 'android' },
    'lang-switch-en-android': { section: 'general', gpuMemory: GPU, languageSwitch: 'android', languageSwitchTo: 'en' },
    'lang-switch-system-ar': { section: 'general', gpuMemory: GPU, languageSwitch: 'android', languageSwitchSystem: true },
    'lang-switch-ar-ios': { section: 'general', gpuMemory: GPU, languageSwitch: 'ios' },
    // SET-PRIV-06: the Delete chats card with chats (`#tap=privacy-delete-all` opens the confirm sheet), and with none.
    'privacy-delete': { section: 'privacy', gpuMemory: GPU, data: { settings: SETTINGS, sessions: [chat('a'), chat('b'), chat('c')] } },
    'privacy-delete-none': { section: 'privacy', gpuMemory: GPU, data: { settings: SETTINGS, sessions: [] } },
};

export function settingsSceneClient(scene: SettingsScene): GaiaClient {
    const client = createFakeClient({
        ...COMMON, spending: spent({}), contexts: { [CHAT_MODEL]: CONTEXT }, gpuMemory: scene.gpuMemory, ...(scene.status ? { status: scene.status } : {}), ...scene.data,
    });
    const hung = scene.hang ? (scene.hang === 'download' ? { downloadModel: never } : { selectModel: never }) : {};
    return { ...client, ...hung, ...scene.override };
}
