// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { alertText } from '@webui/utils/chatAlerts.core';
import type { Translate } from '@webui/i18n/translator';
import type { Session } from '@webui/types';
import type { GaiaNotification, NotificationType } from '@webui/types/agent';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { GaiaClient, SetupCheck, SystemStatus } from '@/api/client.types';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { ChatAlertBanner } from '@/state/chatAlertBanner';
import { GOAL_STORE_NOTIFICATION_ID } from '@/state/goalAlerts';

/** What a notifications scene shows: the center, the connection banner, the setup gate's notice, or the alert settings. */
export interface NotificationScene {
    view: 'center' | 'banner' | 'gate' | 'alerts';
    /** Titles built with the live translator resolve through a function; see resolveSceneItems. */
    items?: GaiaNotification[] | ((t: Translate) => GaiaNotification[]);
    /** Adds the goal-store alert to the items, built with the live translator. */
    goalStore?: boolean;
    filter?: NotificationType | null;
    /** Approvals whose chat is still blocked on the answer, by confirm id. */
    waiting?: string[];
    chatAlert?: ChatAlertSpec;
    /** The status request fails like a PC that doesn't answer. */
    unreachable?: boolean;
    /** The status request answers a gateway 504, the phone's only "slow to answer" signal. */
    slow?: boolean;
    data?: FakeClientData;
}

export interface ChatAlertSpec {
    event: ChatAlertBanner['event'];
    tone: ChatAlertBanner['tone'];
    title: string;
    status?: Session['last_run_status'];
}

/** The banner the chat-alert feed raises, in the viewer's language: the catalog's headline, with the chat's own title as the body. */
export const chatAlertBanner = (spec: ChatAlertSpec, t: Translate): ChatAlertBanner => {
    const { title: headline, body } = alertText(spec.event, { title: spec.title, last_run_status: spec.status } as Session, t);
    return { sessionId: 's-chat', event: spec.event, tone: spec.tone, title: headline, message: body };
};

const MIN = 60_000;
const ago = (ms: number) => Date.now() - ms;

const note = (over: Partial<GaiaNotification> & { id: string; type: GaiaNotification['type'] }): GaiaNotification => ({
    agentId: 'gaia', agentName: 'GAIA', title: '', message: '', timestamp: ago(5 * MIN), read: false, dismissed: false, priority: 'medium', ...over,
});

/** AppPolls builds this title with `t('schedules.finished')`; the scene does the same so it follows the viewer's language. */
const finishedNote = (t: Translate): GaiaNotification => note({ id: 'n-finished', type: 'info', title: t('schedules.finished', { name: 'Morning summary' }), message: 'Three new emails need a reply, and the 2 PM meeting moved to 3 PM.', sessionId: 's-sched', timestamp: ago(3 * MIN) });
/** AppPolls builds this title with `t('schedules.failed')`; see finishedNote. */
const failedNote = (t: Translate): GaiaNotification => note({ id: 'n-failed', type: 'error', title: t('schedules.failed', { name: 'Weekly backup' }), message: 'The backup folder D:\\Backups is not reachable.', sessionId: 's-backup', priority: 'high', timestamp: ago(52 * MIN) });
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

/** APP-14: the alert AppPolls raises when the goal store is unreadable, titled in the viewer's language (`?state=goal-store-error`). */
export const goalStoreNotification = (t: Translate): GaiaNotification => note({
    id: `${GOAL_STORE_NOTIFICATION_ID}1`, type: 'error', agentId: 'goals', title: t('mem.goals.storeError'),
    message: 'The goal list is unreadable: unexpected end of JSON input.', priority: 'high', timestamp: ago(MIN),
});

const mixed = (t: Translate) => [ASK, finishedNote(t), failedNote(t), POLICY, SECURITY, INFO];

/** The scene's items, with titles built by `t`. */
export const resolveSceneItems = (scene: NotificationScene, t: Translate): GaiaNotification[] =>
    typeof scene.items === 'function' ? scene.items(t) : (scene.items ?? []);

const STATUS_OK = {
    lemonade_running: true, context_size_sufficient: true, model_context_size: 65536, download_progress: null, init_state: 'ready',
} as unknown as SystemStatus;
const status = (patch: Partial<SystemStatus>): FakeClientData => ({ status: { ...STATUS_OK, ...patch } as SystemStatus });

const DOWNLOAD = {
    state: 'downloading', model_name: 'Gemma-4-E4B-it-GGUF', percent: 42, file: 'gemma-4-e4b-it-Q4_K_M.gguf', file_index: 1, total_files: 2,
    downloaded_bytes: 2.5e9, total_bytes: 5.97e9, message: null,
} as const;

const START_COMMAND = 'C:\\Program Files\\Lemonade\\lemond.exe';

const check = (patch: Partial<SetupCheck>) => ({ setupChecks: [{ ready: false, steps: [], ...patch } as SetupCheck] });

export const NOTIFICATION_SCENES: Record<string, NotificationScene> = {
    'all-read': { view: 'center', items: (t) => mixed(t).map((n) => ({ ...n, read: true })) },
    'alert-settings': { view: 'alerts' },
    'banner-backend-error': { view: 'banner', data: {} },
    'banner-chat-finished': { view: 'banner', data: status({}), chatAlert: { event: 'finished', tone: 'success', title: 'Quarterly plan', status: 'done' } },
    'banner-chat-failed': { view: 'banner', data: status({}), chatAlert: { event: 'finished', tone: 'danger', title: 'Quarterly plan', status: 'failed' } },
    'banner-chat-needs-approval': { view: 'banner', data: status({}), chatAlert: { event: 'needs_approval', tone: 'warning', title: 'Weekly report' } },
    'banner-config-error': { view: 'banner', data: status({ config_error: 'The settings file is not valid JSON (line 12).' } as Partial<SystemStatus>) },
    'banner-context-small': { view: 'banner', data: status({ context_size_sufficient: false, model_context_size: 4096 }) },
    'banner-download': { view: 'banner', data: status({ download_progress: DOWNLOAD }) },
    'banner-download-failed': { view: 'banner', data: status({ download_progress: { ...DOWNLOAD, state: 'error', message: 'Not enough disk space on C:.' } }) },
    'banner-download-starting': { view: 'banner', data: status({ download_progress: { ...DOWNLOAD, state: 'starting', percent: 0, total_bytes: 0, message: null } }) },
    // The model server isn't answering: GAIA's own (it starts by itself, so the title stands alone), your own server
    // busy or stopped with the PC's start command on its own line, and a PC with no model server set up yet.
    'banner-own-server-down': { view: 'banner', data: status({ lemonade_running: false, start_command: null, start_instruction: null }) },
    'banner-server-hung': { view: 'banner', data: status({ lemonade_running: false, lemonade_error: 'The model server timed out.', start_command: START_COMMAND }) },
    'banner-server-setup': { view: 'banner', data: status({ lemonade_running: false, start_command: null, start_instruction: 'Run gaia init to install the model server.' }) },
    'banner-server-stopped': { view: 'banner', data: status({ lemonade_running: false, start_command: START_COMMAND }) },
    'banner-slow': { view: 'banner', slow: true },
    'banner-starting': { view: 'banner', data: status({ init_state: 'initializing', init_tasks: [{ name: 'Loading the model', status: 'running' }] } as Partial<SystemStatus>) },
    'banner-unreachable': { view: 'banner', unreachable: true },
    empty: { view: 'center', items: [] },
    'goal-store-error': { view: 'center', items: (t) => [finishedNote(t)], goalStore: true },
    'errors-filter': { view: 'center', items: mixed, filter: 'error' },
    mixed: { view: 'center', items: mixed },
    'permission-answered': { view: 'center', items: [{ ...ASK, response: 'allow', read: true }, { ...ASK, id: 'n-ask-2', confirmId: 'confirm-2', response: 'deny', read: true, timestamp: ago(40 * MIN) }] },
    'permission-expired': { view: 'center', items: [ASK] },
    'permission-pending': { view: 'center', items: (t) => [ASK, finishedNote(t)], waiting: ['confirm-1'] },
    'policy-alert': { view: 'center', items: [POLICY, { ...POLICY, id: 'n-policy-2', receiptId: undefined, ruleIds: undefined, policyVersion: undefined, timestamp: ago(30 * 3_600_000) }] },
    'schedule-failed': { view: 'center', items: (t) => [failedNote(t)], filter: null },
    'schedule-finished': { view: 'center', items: (t) => [finishedNote(t)] },
    'setup-check-failed': { view: 'gate', data: { setupChecks: [new GaiaApiError(500, 'The setup check crashed.')] } },
    // NTF-15: the embedded server's update stopped (`Try again`); the restore-model notices are `/dev/model-server?state=restore-failed` and `restore-ok`.
    'setup-upgrading-failed': { view: 'gate', data: { setupChecks: [{ ready: false, stage: 'upgrade', steps: [] } as unknown as SetupCheck], setupStatus: { state: 'failed', error: 'The download was interrupted.' } as never } },
    'setup-server-down': { view: 'gate', data: check({ stage: 'server', initialized: true } as Partial<SetupCheck>) },
    'setup-server-down-list-unread': { view: 'gate', data: check({ stage: 'server', initialized: true, model_list_unread: true } as Partial<SetupCheck>) },
};

export function notificationSceneClient(scene: NotificationScene): GaiaClient {
    const client = createFakeClient(scene.data ?? {});
    if (scene.slow) return { ...client, getSystemStatus: () => Promise.reject(new GaiaApiError(504, 'The PC did not answer in time.')) };
    if (!scene.unreachable) return client;
    return { ...client, getSystemStatus: () => Promise.reject(new GaiaNetworkError('http://pc.local:4200', new Error('Network request failed'))) };
}
