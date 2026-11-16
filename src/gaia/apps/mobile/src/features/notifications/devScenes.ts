// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GaiaNotification, NotificationType } from '@webui/types/agent';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { GaiaClient, SetupCheck, SystemStatus } from '@/api/client.types';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { ChatAlertBanner } from '@/state/chatAlertBanner';

/** What a notifications scene shows: the center, the connection banner, the setup gate's notice, or the alert settings. */
export interface NotificationScene {
    view: 'center' | 'banner' | 'gate' | 'alerts';
    items?: GaiaNotification[];
    filter?: NotificationType | null;
    /** Approvals whose chat is still blocked on the answer, by confirm id. */
    waiting?: string[];
    chatAlert?: ChatAlertBanner;
    /** The status request fails like a PC that doesn't answer. */
    unreachable?: boolean;
    /** The status request answers a gateway 504, the phone's only "slow to answer" signal. */
    slow?: boolean;
    data?: FakeClientData;
}

const MIN = 60_000;
const ago = (ms: number) => Date.now() - ms;

const note = (over: Partial<GaiaNotification> & { id: string; type: GaiaNotification['type'] }): GaiaNotification => ({
    agentId: 'gaia', agentName: 'GAIA', title: '', message: '', timestamp: ago(5 * MIN), read: false, dismissed: false, priority: 'medium', ...over,
});

const FINISHED = note({ id: 'n-finished', type: 'status_change', title: 'Scheduled task "Morning summary" finished', message: 'Three new emails need a reply, and the 2 PM meeting moved to 3 PM.', sessionId: 's-sched', timestamp: ago(3 * MIN) });
const FAILED = note({ id: 'n-failed', type: 'error', title: 'Scheduled task "Weekly backup" failed', message: 'The backup folder D:\\Backups is not reachable.', sessionId: 's-backup', priority: 'high', timestamp: ago(52 * MIN) });
const ASK = note({
    id: 'confirm-1', type: 'permission_request', title: 'Run a command?', message: 'GAIA needs your OK to run a command.', tool: 'run_shell_command', toolLabel: 'run a command',
    toolArgs: { command: 'git status' }, sessionId: 's-chat', confirmId: 'confirm-1', priority: 'high', timestamp: ago(MIN),
});
const POLICY = note({
    id: 'n-policy', type: 'policy_alert', title: 'Blocked', message: 'The tool call was blocked by your policy.', tool: 'delete_file', reason: 'Deleting files is restricted.',
    ruleIds: ['no-delete'], policyVersion: '2026-11-01', receiptId: 'rcpt-4f2a', sessionId: 's-chat', priority: 'high', timestamp: ago(2 * 3_600_000),
});
const SECURITY = note({ id: 'n-security', type: 'security_alert', title: 'Unusual sign-in', message: 'A new device asked to pair with your PC.', priority: 'critical', timestamp: ago(26 * 3_600_000), read: true });
const INFO = note({ id: 'n-info', type: 'info', title: 'GAIA updated', message: 'GAIA 0.26 is ready. Restart it on your PC to finish.', timestamp: ago(3 * 24 * 3_600_000), read: true });

const MIXED = [ASK, FINISHED, FAILED, POLICY, SECURITY, INFO];

const STATUS_OK = {
    lemonade_running: true, context_size_sufficient: true, model_context_size: 65536, download_progress: null, init_state: 'ready',
} as unknown as SystemStatus;
const status = (patch: Partial<SystemStatus>): FakeClientData => ({ status: { ...STATUS_OK, ...patch } as SystemStatus });

const DOWNLOAD = {
    state: 'downloading', model_name: 'Gemma-4-E4B-it-GGUF', percent: 42, file: 'gemma-4-e4b-it-Q4_K_M.gguf', file_index: 1, total_files: 2,
    downloaded_bytes: 2.5e9, total_bytes: 5.97e9, message: null,
} as const;

const check = (patch: Partial<SetupCheck>) => ({ setupChecks: [{ ready: false, steps: [], ...patch } as SetupCheck] });

export const NOTIFICATION_SCENES: Record<string, NotificationScene> = {
    'all-read': { view: 'center', items: MIXED.map((n) => ({ ...n, read: true })) },
    'alert-settings': { view: 'alerts' },
    'banner-backend-error': { view: 'banner', data: {} },
    'banner-chat-finished': { view: 'banner', data: status({}), chatAlert: { sessionId: 's-sched', event: 'finished', tone: 'success', title: 'Morning summary finished', message: 'Three new emails need a reply.' } },
    'banner-chat-needs-approval': { view: 'banner', data: status({}), chatAlert: { sessionId: 's-chat', event: 'needs_approval', tone: 'warning', title: 'Weekly report needs your approval', message: 'GAIA wants to run a command.' } },
    'banner-config-error': { view: 'banner', data: status({ config_error: 'The settings file is not valid JSON (line 12).' } as Partial<SystemStatus>) },
    'banner-context-small': { view: 'banner', data: status({ context_size_sufficient: false, model_context_size: 4096 }) },
    'banner-download': { view: 'banner', data: status({ download_progress: DOWNLOAD }) },
    'banner-download-failed': { view: 'banner', data: status({ download_progress: { ...DOWNLOAD, state: 'error', message: 'Not enough disk space on C:.' } }) },
    'banner-download-starting': { view: 'banner', data: status({ download_progress: { ...DOWNLOAD, state: 'starting', percent: 0, total_bytes: 0, message: null } }) },
    'banner-server-hung': { view: 'banner', data: status({ lemonade_running: false, lemonade_error: 'The model server timed out.' }) },
    'banner-server-stopped': { view: 'banner', data: status({ lemonade_running: false }) },
    'banner-slow': { view: 'banner', slow: true },
    'banner-starting': { view: 'banner', data: status({ init_state: 'initializing', init_tasks: [{ name: 'Loading the model', status: 'running' }] } as Partial<SystemStatus>) },
    'banner-unreachable': { view: 'banner', unreachable: true },
    empty: { view: 'center', items: [] },
    'errors-filter': { view: 'center', items: MIXED, filter: 'error' },
    mixed: { view: 'center', items: MIXED },
    'permission-answered': { view: 'center', items: [{ ...ASK, response: 'allow', read: true }, { ...ASK, id: 'n-ask-2', confirmId: 'confirm-2', response: 'deny', read: true, timestamp: ago(40 * MIN) }] },
    'permission-expired': { view: 'center', items: [ASK] },
    'permission-pending': { view: 'center', items: [ASK, FINISHED], waiting: ['confirm-1'] },
    'policy-alert': { view: 'center', items: [POLICY, { ...POLICY, id: 'n-policy-2', receiptId: undefined, ruleIds: undefined, policyVersion: undefined, timestamp: ago(30 * 3_600_000) }] },
    'schedule-failed': { view: 'center', items: [FAILED], filter: null },
    'schedule-finished': { view: 'center', items: [FINISHED] },
    'setup-check-failed': { view: 'gate', data: { setupChecks: [new GaiaApiError(500, 'The setup check crashed.')] } },
    'setup-server-down': { view: 'gate', data: check({ stage: 'server', initialized: true } as Partial<SetupCheck>) },
    'setup-server-down-list-unread': { view: 'gate', data: check({ stage: 'server', initialized: true, model_list_unread: true } as Partial<SetupCheck>) },
};

export function notificationSceneClient(scene: NotificationScene): GaiaClient {
    const client = createFakeClient(scene.data ?? {});
    if (scene.slow) return { ...client, getSystemStatus: () => Promise.reject(new GaiaApiError(504, 'The PC did not answer in time.')) };
    if (!scene.unreachable) return client;
    return { ...client, getSystemStatus: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200', new Error('Network request failed'))) };
}
