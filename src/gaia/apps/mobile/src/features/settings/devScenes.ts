// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { SystemStatus } from '@webui/types';

import type { ContextChoice, DiscordStatus, GaiaClient, CustomModelReport, GpuMemoryStatus, LemonadeTarget, MCPServerStatus, ModelServerInfo, ProviderModel, Settings, SpendingReport } from '@/api/client.types';
import { PC_ONLY_REFUSAL } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { COMMON, GPU } from '@/features/setup/devScenes';

import type { SectionId } from './sections';

/** A settings pane on a fake PC: which section, and the anchor it opens on. */
export interface SettingsScene {
    section: Extract<SectionId, 'advanced' | 'messaging' | 'model' | 'setup'>;
    target?: string;
    gpuMemory: GpuMemoryStatus | Error;
    status?: FakeClientData['status'];
    /** The provider tab the Model pane opens on; local when unset. */
    provider?: string;
    /** More of the fake PC, over the common data. */
    data?: FakeClientData;
    /** An action that never finishes, so its in-flight state stays on screen: tap its button (`#tap=model-download-<id>` or `#tap=model-use-<id>`). */
    hang?: 'download' | 'select';
    /** Client calls the scene answers itself (a hang or a PC refusal), over the fake's. */
    override?: Partial<GaiaClient>;
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
    checks: [{ id: 'chat', label: 'Chat model', ok: true, detail: 'Has a chat template' }, { id: 'fit', label: 'Fits this PC', ok: true, detail: 'Needs 4.6 GB' }],
    warnings: [], variants: [],
};

const never = () => new Promise<never>(() => undefined);
const refused = () => Promise.reject(new GaiaApiError(403, PC_ONLY_REFUSAL));

const discord = (extra: Partial<DiscordStatus>): DiscordStatus => ({
    connected: true, paired: false, running: true, state: 'stopped', detail: '', bot_name: 'GAIA Helper', owner_name: '', autostart: false,
    always_allowed: [], model: '', portal_url: 'https://discord.com/developers/applications', bot_page_url: 'https://discord.com/developers/applications/1/bot',
    invite_url: 'https://discord.com/oauth2/authorize?client_id=1', bot_profile_url: 'https://discord.com/users/1', pairing_code: '', pairing_expires_at: 0,
    discord_installed: false, should_offer_setup: false, ...extra,
});
const NO_TOKEN = { connected: false, bot_name: '', bot_profile_url: '', invite_url: '' };
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
        data: local([HAVE, model(WANT.id, { ...WANT, download_progress: { model_name: WANT.id, state: 'downloading', percent: 42, downloaded_bytes: 9.8e9, total_bytes: 23.3e9, file: null, file_index: 1, total_files: 1, message: null } }), WANT_SMALL]),
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
};

export function settingsSceneClient(scene: SettingsScene): GaiaClient {
    const client = createFakeClient({
        ...COMMON, contexts: { [CHAT_MODEL]: CONTEXT }, gpuMemory: scene.gpuMemory, ...(scene.status ? { status: scene.status } : {}), ...scene.data,
    });
    const hung = scene.hang ? (scene.hang === 'download' ? { downloadModel: never } : { selectModel: never }) : {};
    return { ...client, ...hung, ...scene.override };
}
