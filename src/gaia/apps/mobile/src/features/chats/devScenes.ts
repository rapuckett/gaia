// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GaiaNotification } from '@webui/types/agent';
import type { SetupRunStatus } from '@webui/types';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { GaiaClient, Message, Session } from '@/api/client.types';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';

import type { ChatListError } from './ChatDrawerContent';
import type { RowSheet } from './ChatRowSheets';
import { NO_LIVE_RUNS, type LiveRuns, type QueuedMessage } from './chatList';

/** The chat list in one state: the fake PC's chats, what is live, and what a tap would have opened. */
export interface DrawerScene {
    data: FakeClientData;
    live?: LiveRuns;
    queues?: Record<string, readonly QueuedMessage[]>;
    activeId?: string;
    error?: ChatListError;
    unreadNotifications?: number;
    /** The setup gate is already saying the PC is unreachable in the main pane. */
    gateUnreachable?: boolean;
    /** The saved "show background runs" choice the drawer opens with. */
    automatedShown?: boolean;
    dev?: { query?: string; sheet?: { rowId: string; mode: RowSheet['mode'] } };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const chat = (id: string, title: string, hours: number, over: Partial<Session> = {}): Session => ({
    id, title, created_at: hoursAgo(hours + 1), updated_at: hoursAgo(hours), model: 'Gemma-4-E4B-it-GGUF',
    system_prompt: null, message_count: 2, document_ids: [], ...over,
});

const message = (id: number, session: string, content: string): Message => ({
    id, session_id: session, role: 'user', content, created_at: hoursAgo(1), rag_sources: null,
});

const SESSIONS: Session[] = [
    chat('ask', 'Which folder should the invoices go in?', 0.2, { last_run_status: 'done' }),
    chat('pin', 'Weekly planning notes', 30, { pinned: true }),
    chat('today', 'Summarize the Q3 report', 1, { unread: true, last_run_status: 'done' }),
    chat('run', 'Draft a reply to the landlord', 2),
    chat('queued', 'Compare two PDF contracts', 3),
    chat('failed', 'Rename my photos by date', 4, { last_run_status: 'failed' }),
    chat('private', 'Notes about my health', 5, { private: true }),
    chat('yday', 'Recipe ideas for the weekend', 28),
    chat('week', 'Trip to Lisbon, hotel options', 24 * 4),
    chat('month', 'Fix the printer driver', 24 * 15),
    chat('old', 'Tax paperwork 2025', 24 * 70),
    chat('sched', 'Daily summary (scheduled)', 6, { kind: 'scheduled' }),
    chat('eval', 'Eval run 42', 7, { kind: 'eval' }),
];

const BACKGROUND_CHATS = SESSIONS.filter((s) => ['today', 'pin', 'sched', 'eval'].includes(s.id));

const MESSAGES: Record<string, Message[]> = {
    today: [message(1, 'today', 'Please summarize the revenue section of the Q3 report')],
    yday: [message(2, 'yday', 'Any ideas for a quick weekend recipe with lentils?')],
    old: [message(3, 'old', 'Where do I file the revenue forms for 2025?')],
};

const COMMON: FakeClientData = { sessions: SESSIONS, messages: MESSAGES };

const live: LiveRuns = { running: ['run'], queued: ['queued'], awaiting: { ask: 'question' }, prompting: [] };

const DOWNLOADING: SetupRunStatus = {
    state: 'running',
    models: [{
        id: 'Gemma-4-E4B-it-GGUF', roles: ['chat'], state: 'downloading', bytes_done: 2_100_000_000, bytes_total: 5_000_000_000,
        speed_bps: 40_000_000, eta_s: 70, error: null, error_kind: null, can_retry: false, retrying_until: null, downloaded_before_gb: null,
    }],
    overall: { bytes_done: 2_100_000_000, bytes_total: 5_000_000_000, speed_bps: 40_000_000, eta_s: 70, percent: 42, failed: 0 },
};

const FAILED: SetupRunStatus = {
    state: 'failed',
    models: [{ ...DOWNLOADING.models![0], state: 'failed', error: 'The network dropped', error_kind: 'network', can_retry: true, speed_bps: 0, eta_s: null }],
    overall: { bytes_done: 2_100_000_000, bytes_total: 5_000_000_000, speed_bps: 0, eta_s: null, percent: 42, failed: 1 },
};

const scene = (over: Partial<DrawerScene> = {}): DrawerScene => ({ ...over, data: { ...COMMON, ...over.data } });

export const DRAWER_SCENES = {
    groups: scene({ live, queues: { queued: [{ state: 'waiting' }], failed: [{ state: 'failed' }] } }),
    'groups-older': scene({ live, data: { sessions: SESSIONS.filter((s) => ['month', 'old', 'week', 'yday'].includes(s.id)) } }),
    'needs-you': scene({ live: { ...NO_LIVE_RUNS, awaiting: { ask: 'permission', today: 'question' } } }),
    running: scene({ live: { ...NO_LIVE_RUNS, running: ['run', 'today'] } }),
    queued: scene({ live: { ...NO_LIVE_RUNS, queued: ['queued', 'run'] }, queues: { queued: [{ state: 'waiting' }, { state: 'waiting' }] } }),
    unsent: scene({ queues: { run: [{ state: 'waiting' }], failed: [{ state: 'failed' }, { state: 'failed' }] } }),
    'status-dots': scene({ live: { ...NO_LIVE_RUNS, running: ['run'], queued: ['queued'], awaiting: { ask: 'question' } } }),
    private: scene({ activeId: 'private' }),
    active: scene({ activeId: 'pin' }),
    'row-menu': scene({ live, dev: { sheet: { rowId: 'today', mode: 'menu' } } }),
    'row-menu-pinned': scene({ live, dev: { sheet: { rowId: 'pin', mode: 'menu' } } }),
    rename: scene({ live, dev: { sheet: { rowId: 'today', mode: 'rename' } } }),
    'delete-confirm': scene({ live, dev: { sheet: { rowId: 'today', mode: 'delete' } } }),
    'delete-unsent': scene({ live, queues: { run: [{ state: 'waiting' }, { state: 'waiting' }] }, dev: { sheet: { rowId: 'run', mode: 'delete' } } }),
    'search-results': scene({ dev: { query: 'revenue' } }),
    'search-title': scene({ dev: { query: 'recipe' } }),
    'search-capped': scene({ data: { searchLimit: 1 }, dev: { query: 'a' } }),
    'search-none': scene({ dev: { query: 'zzzz' } }),
    'search-failed': scene({ data: { searchError: 'Search is unavailable' }, dev: { query: 'revenue' } }),
    empty: scene({ data: { sessions: [] } }),
    'list-error': scene({ data: { sessionsError: new GaiaApiError(500, 'database is locked') } }),
    'list-unavailable': scene({ data: { sessionsError: new GaiaNetworkError('http://pc.local:4200', 'timed out') }, gateUnreachable: true }),
    'error-delete': scene({ error: { kind: 'delete', error: new GaiaApiError(409, 'Chat is running') } }),
    'error-rename': scene({ error: { kind: 'rename', error: new GaiaApiError(500, 'database is locked') } }),
    'error-pin': scene({ error: { kind: 'pin', error: new Error('') } }),
    'error-mark-read': scene({ error: { kind: 'markRead', error: new Error('The PC did not answer') } }),
    'background-hidden': scene({ automatedShown: false, data: { sessions: BACKGROUND_CHATS } }),
    'background-shown': scene({ automatedShown: true, data: { sessions: BACKGROUND_CHATS } }),
    'download-chip': scene({ data: { setupStatus: DOWNLOADING } }),
    'download-failed': scene({ data: { setupStatus: FAILED } }),
    'notifications-badge': scene({ unreadNotifications: 3 }),
    'notifications-badge-99': scene({ unreadNotifications: 120 }),
} satisfies Record<string, DrawerScene>;

export type DrawerSceneName = keyof typeof DRAWER_SCENES;

export function drawerSceneClient(found: DrawerScene): GaiaClient {
    return createFakeClient(found.data);
}

export function sceneNotifications(n: number): GaiaNotification[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `scene-${i}`, type: 'info', agentId: 'gaia', agentName: 'GAIA', title: `Notice ${i + 1}`, message: 'A scene notice',
        timestamp: Date.now() - i * 60_000, read: false, dismissed: false, priority: 'low',
    }));
}
