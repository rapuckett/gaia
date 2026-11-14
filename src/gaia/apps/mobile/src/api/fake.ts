// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type {
    AgentInfo,
    AgentMcpServer,
    ConnectorListEntry,
    CreateSessionRequest,
    FollowUpOutcome,
    DocumentListResponse,
    GaiaClient,
    HealthResponse,
    LocalModelStatus,
    Message,
    MessageList,
    ModelNeed,
    ParsedSchedule,
    Schedule,
    ResourceUsage,
    Session,
    SessionList,
    SessionSearchResponse,
    SessionSearchResult,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    StartScreen,
    StreamEvent,
    SystemStatus,
    ToolConfirmRequest,
    UserInputRequest,
} from './client.types';
import { foldText, splitMatch } from '@webui/utils/chatSearch';

import { GaiaApiError } from './errors';

function cloneNested<T>(source: Record<string, Record<string, T>> | undefined): Record<string, Record<string, T>> {
    return Object.fromEntries(Object.entries(source ?? {}).map(([key, inner]) => [key, { ...inner }]));
}

export interface FakeClientData {
    sessions?: Session[];
    schedules?: Schedule[];
    messages?: Record<string, Message[]>;
    /** What every send streams back; a function takes the sent text and streams what a test scripts. */
    replies?: StreamEvent[] | ((message: string) => AsyncIterable<StreamEvent>);
    /** What attachToRun replays, by chat; a chat not listed has no turn running. */
    running?: Record<string, StreamEvent[]>;
    connectors?: ConnectorListEntry[];
    agents?: AgentInfo[];
    /** Grants by connector id, then namespaced agent id. */
    grants?: Record<string, Record<string, string[]>>;
    /** Activations by connector id, then namespaced agent id. */
    activations?: Record<string, Record<string, boolean>>;
    agentMcps?: AgentMcpServer[];
    /** What getFollowUpOutcome answers; a function may throw to script a 409. */
    followUpOutcome?: FollowUpOutcome | (() => FollowUpOutcome);
    /** Makes sendFollowUp reject, as a turn that can't take the message does. */
    followUpRefusal?: GaiaApiError;
    status?: SystemStatus;
    /** What getLocalModelStatus answers; restarting it records the call. */
    localModel?: LocalModelStatus;
    /** What getModelNeed answers, by job; a job not listed needs nothing. */
    modelNeeds?: Partial<Record<ModelNeed['job'], ModelNeed>>;
    /** What getSetupStatus answers. */
    setupStatus?: SetupRunStatus;
    resources?: ResourceUsage;
    start?: StartScreen;
    /** Most chats a search returns before it says `truncated`. */
    searchLimit?: number;
    /** Makes every search fail with this message. */
    searchError?: string;
    /** Each check answers the next entry (the last one repeats); an Error entry is thrown. */
    setupChecks?: (SetupCheck | Error)[];
    /** Each status read answers the next entry (the last one repeats); defaults to idle. */
    setupStatuses?: (SetupRunStatus | Error)[];
    setupPlan?: SetupPlan;
    documents?: DocumentListResponse;
}

export interface FakeGaiaClient extends GaiaClient {
    readonly sent: { sessionId: string; message: string }[];
    readonly created: CreateSessionRequest[];
    readonly cancelled: string[];
    readonly deleted: { sessionId: string; messageId: number }[];
    readonly deletedOne: { sessionId: string; messageId: number }[];
    readonly confirmations: ToolConfirmRequest[];
    readonly answers: UserInputRequest[];
    readonly scheduleActions: { action: 'pause' | 'resume' | 'run' | 'delete'; name: string }[];
    readonly followUps: { sessionId: string; text: string }[];
    readonly restarts: { confirm: boolean }[];
    readonly downloads: { modelId: string; acknowledgeLowDisk: boolean }[];
    readonly setupStarts: { skipChatModel: boolean; gaiaLemonade: boolean; upgradeEmbedded: boolean }[];
    readonly detached: { sessionId: string; docId: string }[];
}

export function createFakeClient(data: FakeClientData = {}): FakeGaiaClient {
    const sessions = [...(data.sessions ?? [])];
    const messages = data.messages ?? {};
    const replies = data.replies ?? [{ type: 'done' } as StreamEvent];
    const running = data.running ?? {};
    const sent: FakeGaiaClient['sent'] = [];
    const created: CreateSessionRequest[] = [];
    const cancelled: string[] = [];
    const deleted: FakeGaiaClient['deleted'] = [];
    const deletedOne: FakeGaiaClient['deletedOne'] = [];
    const confirmations: ToolConfirmRequest[] = [];
    const answers: UserInputRequest[] = [];
    const grants: Record<string, Record<string, string[]>> = cloneNested(data.grants);
    const activations: Record<string, Record<string, boolean>> = cloneNested(data.activations);
    const restarts: FakeGaiaClient['restarts'] = [];
    const downloads: FakeGaiaClient['downloads'] = [];
    const schedules = [...(data.schedules ?? [])];
    const scheduleActions: FakeGaiaClient['scheduleActions'] = [];

    function findSchedule(name: string): Schedule {
        const schedule = schedules.find((s) => s.name === name);
        if (!schedule) throw new GaiaApiError(404, `Schedule '${name}' not found`);
        return schedule;
    }
    const followUps: FakeGaiaClient['followUps'] = [];
    const setupStarts: FakeGaiaClient['setupStarts'] = [];
    let checkAt = 0;
    let statusAt = 0;
    const nextOf = <T,>(list: (T | Error)[], at: number): T => {
        const item = list[Math.min(at, list.length - 1)]!;
        if (item instanceof Error) throw item;
        return item;
    };
    const detached: FakeGaiaClient['detached'] = [];

    function findSession(sessionId: string): Session {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) throw new GaiaApiError(404, 'Session not found');
        return session;
    }

    return {
        sent,
        created,
        cancelled,
        deleted,
        deletedOne,
        confirmations,
        answers,
        scheduleActions,
        followUps,
        restarts,
        downloads,
        setupStarts,
        detached,
        async health(): Promise<HealthResponse> {
            return { status: 'ok', service: 'gaia-agent-ui' };
        },
        async listSessions(): Promise<SessionList> {
            return { sessions: [...sessions], total: sessions.length };
        },
        async getSession(sessionId) {
            return findSession(sessionId);
        },
        async createSession(request = {}) {
            created.push(request);
            const now = new Date().toISOString();
            const session: Session = {
                id: `fake-${created.length}`,
                title: request.title ?? '',
                created_at: now,
                updated_at: now,
                model: request.model ?? '',
                system_prompt: request.system_prompt ?? null,
                message_count: 0,
                document_ids: request.document_ids ?? [],
            };
            sessions.unshift(session);
            return session;
        },
        async getFollowUpOutcome() {
            const outcome = data.followUpOutcome ?? { taken: [], returned: [] };
            return typeof outcome === 'function' ? outcome() : outcome;
        },
        async searchSessions(query): Promise<SessionSearchResponse> {
            if (data.searchError) throw new GaiaApiError(500, data.searchError);
            const needle = foldText(query);
            const results: SessionSearchResult[] = [];
            for (const s of sessions) {
                if (foldText(s.title).includes(needle)) {
                    results.push({ session_id: s.id, title: s.title, field: 'title', snippet: splitMatch(s.title, query)! });
                    continue;
                }
                for (const m of messages[s.id] ?? []) {
                    const snippet = splitMatch(m.content, query);
                    if (snippet) {
                        results.push({ session_id: s.id, title: s.title, field: 'message', snippet });
                        break;
                    }
                }
            }
            const limit = data.searchLimit ?? Infinity;
            return { query, results: results.slice(0, limit), truncated: results.length > limit };
        },
        async getMessages(sessionId): Promise<MessageList> {
            const list = messages[sessionId] ?? [];
            return { messages: list, total: list.length };
        },
        async deleteMessage(sessionId, messageId) {
            deletedOne.push({ sessionId, messageId });
            const list = messages[sessionId] ?? [];
            if (!list.some((m) => m.id === messageId)) throw new GaiaApiError(404, 'Message not found');
            messages[sessionId] = list.filter((m) => m.id !== messageId);
            return { deleted: true };
        },
        async deleteMessagesFrom(sessionId, messageId) {
            deleted.push({ sessionId, messageId });
            const list = messages[sessionId] ?? [];
            const at = list.findIndex((m) => m.id === messageId);
            if (at < 0) throw new GaiaApiError(404, 'Message not found');
            messages[sessionId] = list.slice(0, at);
            return { deleted: true, count: list.length - at };
        },
        async sendFollowUp(sessionId, text) {
            if (data.followUpRefusal) throw data.followUpRefusal;
            followUps.push({ sessionId, text });
            return { delivered: true };
        },
        async updateSession(sessionId, update) {
            const session = findSession(sessionId);
            if (update.title !== undefined) session.title = update.title;
            if (update.title_is_custom !== undefined) session.title_is_custom = update.title_is_custom;
            return { ...session };
        },
        async toggleSessionPrivate(sessionId) {
            const session = findSession(sessionId);
            session.private = !session.private;
            return { ...session };
        },
        async detachDocument(sessionId, docId) {
            const session = findSession(sessionId);
            detached.push({ sessionId, docId });
            session.document_ids = session.document_ids.filter((id) => id !== docId);
        },
        async getResourceUsage() {
            if (!data.resources) throw new GaiaApiError(503, 'This fake client was given no resource usage.');
            return data.resources;
        },
        async *sendMessage(sessionId, message) {
            sent.push({ sessionId, message });
            yield* typeof replies === 'function' ? replies(message) : replies;
        },
        async *attachToRun(sessionId) {
            yield* running[sessionId] ?? [];
        },
        async cancelChat(sessionId) {
            cancelled.push(sessionId);
            return { status: 'ok', cancelled: true };
        },
        async confirmTool(request) {
            confirmations.push(request);
            return { status: 'ok', approved: request.approved, granted: null };
        },
        async sendUserInput(request) {
            answers.push(request);
            return { status: 'ok', request_id: request.request_id };
        },
        async listConnectors() {
            return { connectors: [...(data.connectors ?? [])] };
        },
        async listAgents() {
            return { agents: [...(data.agents ?? [])] };
        },
        async listConnectorGrants(connectorId) {
            return { grants: { ...grants[connectorId] } };
        },
        async listConnectorActivations(connectorId) {
            return { activations: { ...activations[connectorId] } };
        },
        async grantConnectorAgent(connectorId, agentId, scopes) {
            grants[connectorId] = { ...grants[connectorId], [agentId]: [...scopes] };
        },
        async revokeConnectorAgentGrant(connectorId, agentId) {
            const { [agentId]: _gone, ...rest } = grants[connectorId] ?? {};
            grants[connectorId] = rest;
        },
        async activateConnectorAgent(connectorId, agentId, scopes) {
            if (scopes && !grants[connectorId]?.[agentId]) {
                grants[connectorId] = { ...grants[connectorId], [agentId]: [...scopes] };
            }
            activations[connectorId] = { ...activations[connectorId], [agentId]: true };
        },
        async deactivateConnectorAgent(connectorId, agentId) {
            const { [agentId]: _gone, ...rest } = activations[connectorId] ?? {};
            activations[connectorId] = rest;
        },
        async listAgentMcps() {
            return { agent_mcps: [...(data.agentMcps ?? [])] };
        },
        async listSchedules() {
            return { schedules: [...schedules], total: schedules.length };
        },
        async createSchedule(request) {
            if (schedules.some((s) => s.name === request.name)) throw new GaiaApiError(409, `Schedule '${request.name}' already exists`);
            const schedule: Schedule = {
                id: `schedule-${schedules.length + 1}`,
                name: request.name,
                interval_seconds: 3600,
                prompt: request.prompt,
                status: 'active',
                created_at: new Date().toISOString(),
                last_run_at: null,
                next_run_at: new Date(Date.now() + 3_600_000).toISOString(),
                last_result: null,
                run_count: 0,
                error_count: 0,
                session_id: null,
                schedule_config: null,
                description: request.interval,
                description_parts: { kind: 'every', count: 1, unit: 'hour', days: null, time: null, start_hour: null, end_hour: null },
                last_error: null,
            };
            schedules.push(schedule);
            return { ...schedule };
        },
        async parseSchedule(input): Promise<ParsedSchedule> {
            const valid = /every|daily|\d/i.test(input);
            return {
                interval_seconds: valid ? 3600 : 0,
                time_of_day: null,
                start_hour: null,
                end_hour: null,
                days_of_week: null,
                description: valid ? input : "Couldn't read that schedule",
                description_parts: valid ? { kind: 'every', count: 1, unit: 'hour', days: null, time: null, start_hour: null, end_hour: null } : null,
                next_run_at: valid ? new Date(Date.now() + 3_600_000).toISOString() : null,
                valid,
            };
        },
        async updateScheduleStatus(name, status) {
            const schedule = findSchedule(name);
            scheduleActions.push({ action: status === 'paused' ? 'pause' : 'resume', name });
            Object.assign(schedule, { status });
            return { ...schedule };
        },
        async runSchedule(name) {
            const schedule = findSchedule(name);
            scheduleActions.push({ action: 'run', name });
            if (schedule.running) throw new GaiaApiError(409, `Schedule '${name}' is already running`);
            Object.assign(schedule, { running: true, run_count: schedule.run_count + 1 });
            return { ...schedule };
        },
        async deleteSchedule(name) {
            const schedule = findSchedule(name);
            scheduleActions.push({ action: 'delete', name });
            schedules.splice(schedules.indexOf(schedule), 1);
            return { deleted: true };
        },
        async listDocuments() {
            return data.documents ?? { documents: [], total: 0, total_chunks: 0, total_size_bytes: 0 };
        },
        async getSystemStatus() {
            if (!data.status) throw new GaiaApiError(503, 'This fake client was given no system status.');
            return data.status;
        },
        async getLocalModelStatus() {
            if (!data.localModel) throw new GaiaApiError(503, 'This fake client was given no model status.');
            return data.localModel;
        },
        async restartLocalModel(confirm) {
            restarts.push({ confirm });
            return { status: 'restarting', model: data.localModel?.model ?? '', starting_server: false };
        },
        async getModelNeed(job) {
            return data.modelNeeds?.[job] ?? { job, needed: false, model: null, disk_free_gb: null };
        },
        async downloadSetupModel(modelId, acknowledgeLowDisk) {
            downloads.push({ modelId, acknowledgeLowDisk });
            return data.setupStatus ?? { state: 'running' };
        },
        async getSetupStatus() {
            if (data.setupStatuses?.length) return nextOf(data.setupStatuses, statusAt++);
            return data.setupStatus ?? { state: 'idle' };
        },
        async cancelSetup() {
            return { cancelled: true };
        },
        async getStartScreen() {
            if (!data.start) throw new GaiaApiError(503, 'This fake client was given no start screen.');
            return data.start;
        },
        async checkSetup() {
            if (!data.setupChecks?.length) throw new GaiaApiError(503, 'This fake client was given no setup checks.');
            return nextOf(data.setupChecks, checkAt++);
        },
        async getSetupPlan() {
            if (!data.setupPlan) throw new GaiaApiError(503, 'This fake client was given no setup plan.');
            return data.setupPlan;
        },
        async startSetup(skipChatModel, gaiaLemonade = false, options = {}) {
            setupStarts.push({ skipChatModel, gaiaLemonade, upgradeEmbedded: !!options.upgradeEmbedded });
            return { state: 'running', upgrade_embedded: !!options.upgradeEmbedded };
        },
    };
}
