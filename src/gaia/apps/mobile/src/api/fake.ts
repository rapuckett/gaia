// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type {
    ActiveModel,
    CloudPriceList,
    ContextChoice,
    AgentCapabilities,
    AgentInfo,
    AgentMcpServer,
    ChatPerformance,
    ConnectorListEntry,
    DisconnectOutcome,
    ContextUsageResult,
    ConsolidateMemoryResult,
    CreateSessionRequest,
    EmbeddingCoverage,
    FollowUpOutcome,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatus,
    GaiaClient,
    GpuMemoryStatus,
    HealthResponse,
    LemonadeFound,
    LemonadeTarget,
    LocalModelStatus,
    KnowledgeCreateBody,
    KnowledgeUpdateBody,
    MemoryActivityDay,
    MemoryKnowledgeItem,
    MemorySettings,
    MemoryStats,
    MemoryToolStat,
    MemoryUpcomingItem,
    Message,
    MessageList,
    ModelNeed,
    ModelServerInfo,
    PreflightReport,
    ProvidersResponse,
    Goal,
    GoalStats,
    ParsedSchedule,
    AllPermissions,
    PermissionMode,
    PickedFile,
    ProviderModelsResponse,
    RebuildEmbeddingsResult,
    ReconcileMemoryResult,
    RefreshSystemContextResult,
    Schedule,
    ScheduleResult,
    ResourceUsage,
    Session,
    SessionList,
    SessionPermissions,
    SessionSearchResponse,
    SessionSearchResult,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    Settings,
    SkillList,
    FeaturedLibraries,
    LinkPreview,
    StartScreen,
    StreamEvent,
    SystemStatus,
    ToolConfirmRequest,
    UndoSettings,
    UserInputRequest,
} from './client.types';
import { foldText, splitMatch } from '@webui/utils/chatSearch';

import { GaiaApiError } from './errors';

function cloneNested<T>(source: Record<string, Record<string, T>> | undefined): Record<string, Record<string, T>> {
    return Object.fromEntries(Object.entries(source ?? {}).map(([key, inner]) => [key, { ...inner }]));
}

const EMPTY_PERFORMANCE: ChatPerformance = {
    latest_message_id: null,
    turns: [],
    totals: {
        turns: 0,
        wall_seconds: null,
        model_seconds: null,
        gaia_seconds: null,
        tokens_in: null,
        tokens_cached: null,
        tokens_out: null,
        tool_calls: null,
        loads: 0,
        load_seconds: null,
        usd: null,
        unpriced_turns: 0,
    },
    now: { model: null, provider: 'unknown', loaded: null, device: null, backend: null, ctx_size: null, weights_gb: null, kv_cache_gb: null, free_gb: null, error: null },
};

export interface FakeClientData {
    sessions?: Session[];
    schedules?: Schedule[];
    /** Past runs by schedule name, newest first. */
    scheduleResults?: Record<string, ScheduleResult[]>;
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
    /** Makes uploadFile reject, as a refused file does. */
    uploadError?: GaiaApiError;
    /** What getActiveModel answers, and what selectModel last picked. */
    activeModel?: ActiveModel;
    /** What listProviderModels answers, by provider. */
    providerModels?: Record<string, ProviderModelsResponse>;
    /** What getContextChoice answers, by model; setContextChoice updates it. */
    contexts?: Record<string, ContextChoice>;
    /** Makes selectModel fail with this. */
    selectError?: GaiaApiError;
    /** What getPermissions answers, by chat; a chat not listed asks first. */
    permissions?: Record<string, PermissionMode>;
    /** The "always allow" grants by chat. */
    permissionGrants?: Record<string, { key: string; label: string }[]>;
    /** The mode new chats start in. */
    defaultPermissionMode?: PermissionMode;
    /** Answers the default-mode PUT with the 403 the PC gives a phone. */
    defaultModePcOnly?: boolean;
    /** What getContextUsage answers. */
    contextUsage?: ContextUsageResult;
    /** What getChatPerformance answers. */
    chatPerformance?: ChatPerformance;
    /** What getFollowUpOutcome answers; a function may throw to script a 409. */
    followUpOutcome?: FollowUpOutcome | (() => FollowUpOutcome);
    /** Makes sendFollowUp reject, as a turn that can't take the message does. */
    followUpRefusal?: GaiaApiError;
    status?: SystemStatus;
    /** What getLocalModelStatus answers; restarting it records the call. */
    localModel?: LocalModelStatus;
    /** What getGpuMemory answers (the same status whatever size is asked for); an Error is thrown. */
    gpuMemory?: GpuMemoryStatus | Error;
    /** What getModelNeed answers, by job; a job not listed needs nothing. */
    modelNeeds?: Partial<Record<ModelNeed['job'], ModelNeed>>;
    /** What getSetupStatus answers. */
    setupStatus?: SetupRunStatus;
    skills?: SkillList;
    featuredLibraries?: FeaturedLibraries;
    linkPreview?: (url: string) => LinkPreview;
    resources?: ResourceUsage;
    start?: StartScreen;
    /** What a disconnect reports about the provider-side revoke; `{}` when unset. */
    disconnectOutcome?: DisconnectOutcome | null;
    /** What watchSessionEvents streams before it ends; the real stream never ends on its own. */
    sessionEvents?: unknown[];
    /** Most chats a search returns before it says `truncated`. */
    searchLimit?: number;
    /** Makes every search fail with this message. */
    searchError?: string;
    /** Each check answers the next entry (the last one repeats); an Error entry is thrown. */
    setupChecks?: (SetupCheck | Error)[];
    /** Each status read answers the next entry (the last one repeats); defaults to idle. */
    setupStatuses?: (SetupRunStatus | Error)[];
    setupPlan?: SetupPlan;
    modelServer?: ModelServerInfo;
    providers?: ProvidersResponse;
    /** What getCloudPrices answers, by provider. */
    cloudPrices?: Record<string, CloudPriceList>;
    /** What recheckSetupNpu answers; an Error is thrown. */
    npuRecheck?: SetupPlan | Error;
    /** What getPreflight answers; an Error is thrown. */
    preflight?: PreflightReport | Error;
    /** What getLemonadeTarget answers; an Error is thrown. */
    lemonadeTarget?: LemonadeTarget | Error;
    /** What detectLemonade answers; an Error is thrown. */
    lemonadeDetect?: { found: LemonadeFound | null; unchecked?: string[] } | Error;
    documents?: DocumentListResponse;
    /** Makes every upload fail with this error. */
    documentUploadError?: Error;
    /** The state an uploaded document comes back in; defaults to complete. */
    uploadStatus?: DocumentResponse['indexing_status'];
    /** What getDocumentStatus answers, by document; one not listed reports its row's status. */
    documentStatuses?: Record<string, Partial<DocumentStatus>>;
    /** Makes a library action on a document reject with this message, by action. */
    documentFailures?: Partial<Record<DocumentAction, string>>;
    /** What getCapabilities answers, by chat; a chat not listed has no agent running (409). */
    capabilities?: Record<string, AgentCapabilities>;
    memorySettings?: MemorySettings;
    /** What listGoals answers; approve, reject, cancel and delete change it. */
    goals?: Goal[] | Error;
    /** What getGoalStoreHealth answers. */
    goalStoreError?: string | null;
    /** What getSettings answers; setNetworkPolicy changes it. */
    settings?: Settings;
    /** Thrown by setNetworkPolicy, as the PC's 403 is. */
    networkPolicyError?: Error;
    /** What getUndoSettings answers; updateUndoSettings changes it. */
    undoSettings?: UndoSettings;
    /** Thrown by deleteSession for these chat ids. */
    deleteSessionErrors?: Record<string, Error>;
    /** Thrown by updateMemorySettings. */
    memorySettingsError?: Error;
    /** Each stats read answers the next entry (the last one repeats); an Error entry is thrown. */
    memoryStats?: (MemoryStats | Error)[];
    embeddingCoverage?: EmbeddingCoverage;
    /** What the activity read answers for a range in days; an Error is thrown. */
    memoryActivity?: (days: number) => MemoryActivityDay[] | Error;
    memoryTools?: MemoryToolStat[] | Error;
    /** The memories the About you tab lists; an Error makes the list fail. Adds, edits and forgets change it. */
    memoryKnowledge?: MemoryKnowledgeItem[] | Error;
    memoryUpcoming?: MemoryUpcomingItem[] | Error;
    /** What each maintenance POST answers; an Error makes it fail. Unlisted ones answer a zero result. */
    memoryActionResults?: {
        consolidate?: ConsolidateMemoryResult | Error;
        rebuildEmbeddings?: RebuildEmbeddingsResult | Error;
        reconcile?: ReconcileMemoryResult | Error;
        rebuildFts?: Error;
        refreshSystemContext?: RefreshSystemContextResult | Error;
    };
}

export type DocumentAction = 'cancel' | 'delete' | 'reindex';

export type KnowledgeCall =
    | { action: 'add'; body: KnowledgeCreateBody }
    | { action: 'update'; id: string; body: KnowledgeUpdateBody }
    | { action: 'delete'; id: string };

export type GoalCall =
    | { action: 'create'; title: string; description: string; priority: string }
    | { action: 'approve' | 'reject' | 'cancel' | 'delete'; id: string };

export interface FakeGaiaClient extends GaiaClient {
    /** Each goal create, approve, reject, cancel and delete, in order. */
    readonly goalCalls: GoalCall[];
    readonly sent: { sessionId: string; message: string }[];
    readonly created: CreateSessionRequest[];
    readonly cancelled: string[];
    readonly deleted: { sessionId: string; messageId: number }[];
    readonly pinned: { sessionId: string; pinned: boolean }[];
    readonly deletedSessions: string[];
    readonly read: string[];
    readonly deletedOne: { sessionId: string; messageId: number }[];
    readonly confirmations: ToolConfirmRequest[];
    readonly answers: UserInputRequest[];
    readonly scheduleActions: { action: 'pause' | 'resume' | 'run' | 'delete'; name: string }[];
    readonly followUps: { sessionId: string; text: string }[];
    readonly restarts: { confirm: boolean }[];
    readonly selected: string[];
    readonly contextSets: { model: string; ctxSize: number | null }[];
    /** The files uploadFile took, in order. */
    readonly uploads: { name: string; size: number }[];
    readonly downloads: { modelId: string; acknowledgeLowDisk: boolean }[];
    readonly removals: string[];
    readonly backendSets: string[];
    /** The setup model choices saved, in order. */
    readonly setupChoices: { kind: 'chat' | 'vision' | 'skip'; modelId: string | null; flag?: boolean }[];
    /** The providers connectProvider was asked for, in order. */
    readonly connects: string[];
    /** How many times recheckSetupNpu was asked. */
    readonly npuRechecks: number;
    readonly documentActions: { action: DocumentAction; docId: string }[];
    readonly setupStarts: { skipChatModel: boolean; gaiaLemonade: boolean; upgradeEmbedded: boolean; serverOnly: boolean }[];
    readonly detached: { sessionId: string; docId: string }[];
    readonly uploaded: PickedFile[];
    readonly attached: { sessionId: string; docId: string }[];
    readonly capabilityReads: string[];
    /** Each memory maintenance POST, in order. */
    readonly memoryActions: string[];
    /** Each memory add, edit and forget, in order. */
    readonly knowledgeCalls: KnowledgeCall[];
    /** The range of each activity read, in order. */
    readonly memoryActivityReads: number[];
    /** How many times the stats were read. */
    readonly memoryStatsReads: number;
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
    const pinned: FakeGaiaClient['pinned'] = [];
    const deletedSessions: string[] = [];
    const read: string[] = [];
    const deletedOne: FakeGaiaClient['deletedOne'] = [];
    const confirmations: ToolConfirmRequest[] = [];
    const answers: UserInputRequest[] = [];
    const grants: Record<string, Record<string, string[]>> = cloneNested(data.grants);
    const activations: Record<string, Record<string, boolean>> = cloneNested(data.activations);
    const restarts: FakeGaiaClient['restarts'] = [];
    const selected: string[] = [];
    const contextSets: FakeGaiaClient['contextSets'] = [];
    const uploads: FakeGaiaClient['uploads'] = [];
    const downloads: FakeGaiaClient['downloads'] = [];
    const removals: FakeGaiaClient['removals'] = [];
    const schedules = [...(data.schedules ?? [])];
    const scheduleActions: FakeGaiaClient['scheduleActions'] = [];
    const documentActions: FakeGaiaClient['documentActions'] = [];
    const library: DocumentListResponse = data.documents ?? { documents: [], total: 0, total_chunks: 0, total_size_bytes: 0 };

    function findDocument(docId: string, action: DocumentAction): DocumentResponse {
        documentActions.push({ action, docId });
        const failure = data.documentFailures?.[action];
        if (failure) throw new GaiaApiError(500, failure);
        const doc = library.documents.find((d) => d.id === docId);
        if (!doc) throw new GaiaApiError(404, 'Document not found');
        return doc;
    }

    function permissionsOf(sessionId: string): SessionPermissions {
        return { session_id: sessionId, mode: data.permissions?.[sessionId] ?? 'ask', grants: [...(data.permissionGrants?.[sessionId] ?? [])] };
    }

    function findSchedule(name: string): Schedule {
        const schedule = schedules.find((s) => s.name === name);
        if (!schedule) throw new GaiaApiError(404, `Schedule '${name}' not found`);
        return schedule;
    }
    const followUps: FakeGaiaClient['followUps'] = [];
    const setupStarts: FakeGaiaClient['setupStarts'] = [];
    const backendSets: string[] = [];
    const setupChoices: FakeGaiaClient['setupChoices'] = [];
    const connects: string[] = [];
    let npuRechecks = 0;
    let checkAt = 0;
    let statusAt = 0;
    const nextOf = <T,>(list: (T | Error)[], at: number): T => {
        const item = list[Math.min(at, list.length - 1)]!;
        if (item instanceof Error) throw item;
        return item;
    };
    const detached: FakeGaiaClient['detached'] = [];
    const uploaded: PickedFile[] = [];
    const attached: FakeGaiaClient['attached'] = [];
    const capabilityReads: string[] = [];
    const memoryActions: string[] = [];
    let memoryStatsReads = 0;
    const memoryActivityReads: number[] = [];
    const knowledgeCalls: KnowledgeCall[] = [];
    const goalCalls: GoalCall[] = [];
    let goals = data.goals instanceof Error ? [] : [...(data.goals ?? [])];
    const goalById = (id: string): Goal => {
        const goal = goals.find((g) => g.id === id);
        if (!goal) throw new GaiaApiError(404, 'Goal not found');
        return goal;
    };
    const setGoal = (id: string, status: Goal['status']): Goal => {
        const goal = goalById(id);
        const next = { ...goal, status };
        goals = goals.map((g) => (g.id === id ? next : g));
        return next;
    };
    let knowledge = data.memoryKnowledge instanceof Error ? [] : [...(data.memoryKnowledge ?? [])];
    let knowledgeAdds = 0;
    function memoryAction<T>(name: string, result: T | Error): T {
        memoryActions.push(name);
        if (result instanceof Error) throw result;
        return result;
    }

    function findSession(sessionId: string): Session {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) throw new GaiaApiError(404, 'Session not found');
        return session;
    }

    // Replaces the object, so a refetch sees a changed row.
    function patch(sessionId: string, changes: Partial<Session>): Session {
        const at = sessions.findIndex((s) => s.id === sessionId);
        if (at < 0) throw new GaiaApiError(404, 'Session not found');
        sessions[at] = { ...sessions[at]!, ...changes };
        return sessions[at]!;
    }

    return {
        sent,
        created,
        cancelled,
        deleted,
        pinned,
        deletedSessions,
        read,
        deletedOne,
        confirmations,
        answers,
        scheduleActions,
        documentActions,
        followUps,
        restarts,
        selected,
        contextSets,
        uploads,
        downloads,
        removals,
        setupStarts,
        backendSets,
        setupChoices,
        connects,
        get npuRechecks() {
            return npuRechecks;
        },
        detached,
        uploaded,
        attached,
        capabilityReads,
        memoryActions,
        memoryActivityReads,
        knowledgeCalls,
        goalCalls,
        async listGoals() {
            if (data.goals instanceof Error) throw data.goals;
            return { goals, total: goals.length };
        },
        async getGoalStats(): Promise<GoalStats> {
            if (data.goals instanceof Error) throw data.goals;
            const count: GoalStats = { goals: {}, tasks: {} };
            for (const goal of goals) count.goals[goal.status] = (count.goals[goal.status] ?? 0) + 1;
            return count;
        },
        async getGoalStoreHealth() {
            return { error: data.goalStoreError ?? null };
        },
        async createGoal(body) {
            goalCalls.push({ action: 'create', ...body });
            const now = new Date().toISOString();
            const goal: Goal = {
                id: `goal-${goals.length + 1}`,
                ...body,
                status: 'queued',
                source: 'user',
                mode_required: 'goal_driven',
                approved_for_auto: true,
                progress_notes: '',
                created_at: now,
                updated_at: now,
                tasks: [],
            };
            goals = [goal, ...goals];
            return goal;
        },
        async approveGoal(id) {
            goalCalls.push({ action: 'approve', id });
            return setGoal(id, 'queued');
        },
        async rejectGoal(id) {
            goalCalls.push({ action: 'reject', id });
            return setGoal(id, 'rejected');
        },
        async cancelGoal(id) {
            goalCalls.push({ action: 'cancel', id });
            return setGoal(id, 'cancelled');
        },
        async deleteGoal(id) {
            goalCalls.push({ action: 'delete', id });
            goalById(id);
            goals = goals.filter((g) => g.id !== id);
        },
        get memoryStatsReads() {
            return memoryStatsReads;
        },
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
        async uploadFile(file, name) {
            if (data.uploadError) throw data.uploadError;
            uploads.push({ name, size: file.size });
            return { filename: name, original_name: name, url: `/api/files/uploads/${name}`, size: file.size, content_type: file.type, is_image: file.type.startsWith('image/') };
        },
        async getContextChoice(model) {
            const choice = data.contexts?.[model];
            if (!choice) throw new GaiaApiError(503, `This fake client was given no context sizes for ${model}.`);
            return choice;
        },
        async setContextChoice(model, ctxSize) {
            const choice = data.contexts?.[model];
            if (!choice) throw new GaiaApiError(503, `This fake client was given no context sizes for ${model}.`);
            contextSets.push({ model, ctxSize });
            const next = { ...choice, chosen: ctxSize, reload: { started: false, reason: 'already_loaded' as const } };
            data.contexts![model] = next;
            return next;
        },
        async getCloudPrices(provider) {
            const list = data.cloudPrices?.[provider];
            if (!list) throw new GaiaApiError(503, `This fake client was given no prices for ${provider}.`);
            return list;
        },
        async getActiveModel() {
            if (!data.activeModel) throw new GaiaApiError(503, 'This fake client was given no active model.');
            return data.activeModel;
        },
        async listProviderModels(provider) {
            return data.providerModels?.[provider] ?? { provider, models: [] };
        },
        async selectModel(model) {
            if (data.selectError) throw data.selectError;
            selected.push(model);
            if (!data.activeModel) throw new GaiaApiError(503, 'This fake client was given no active model.');
            data.activeModel = { ...data.activeModel, model };
            return data.activeModel;
        },
        async getPermissions(sessionId): Promise<SessionPermissions> {
            return permissionsOf(sessionId);
        },
        async listAllPermissions(): Promise<AllPermissions> {
            const ids = new Set([...Object.keys(data.permissions ?? {}), ...Object.keys(data.permissionGrants ?? {})]);
            const sessions = [...ids].map(permissionsOf).filter((p) => p.mode !== 'ask' || p.grants.length > 0);
            return { default_mode: data.defaultPermissionMode ?? 'ask', sessions };
        },
        async setDefaultPermissionMode(mode) {
            if (data.defaultModePcOnly) throw new GaiaApiError(403, 'Change this on the PC running GAIA.');
            data.defaultPermissionMode = mode;
            return { default_mode: mode };
        },
        async revokeGrants(sessionId, key): Promise<SessionPermissions> {
            const held = data.permissionGrants?.[sessionId] ?? [];
            if (key !== undefined && !held.some((g) => g.key === key)) throw new GaiaApiError(404, `No grant '${key}' in this chat.`);
            data.permissionGrants = { ...data.permissionGrants, [sessionId]: key === undefined ? [] : held.filter((g) => g.key !== key) };
            return permissionsOf(sessionId);
        },
        async setPermissionMode(sessionId, mode): Promise<SessionPermissions> {
            data.permissions = { ...data.permissions, [sessionId]: mode };
            return permissionsOf(sessionId);
        },
        async getContextUsage() {
            return data.contextUsage ?? { available: false, reason: 'Measured once GAIA has answered in this chat.' };
        },
        async getChatPerformance() {
            return data.chatPerformance ?? EMPTY_PERFORMANCE;
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
        async setSessionPinned(sessionId, value) {
            findSession(sessionId);
            pinned.push({ sessionId, pinned: value });
            return patch(sessionId, { pinned: value });
        },
        async deleteSession(sessionId) {
            findSession(sessionId);
            if (data.deleteSessionErrors?.[sessionId]) throw data.deleteSessionErrors[sessionId];
            deletedSessions.push(sessionId);
            sessions.splice(sessions.findIndex((s) => s.id === sessionId), 1);
            return { deleted: true };
        },
        async markSessionRead(sessionId) {
            findSession(sessionId);
            read.push(sessionId);
            return patch(sessionId, { unread: false });
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
        async *watchSessionEvents() {
            yield* (data.sessionEvents ?? []) as StreamEvent[];
        },
        async listConnectors() {
            return { connectors: [...(data.connectors ?? [])] };
        },
        async disableConnector(connectorId) {
            data.connectors = (data.connectors ?? []).map((c) => (c.id === connectorId && !('error' in c) ? { ...c, enabled: false } : c));
        },
        async disconnectConnector(connectorId) {
            data.connectors = (data.connectors ?? []).map((c) =>
                c.id === connectorId && !('error' in c) ? { ...c, configured: false, enabled: true, account_id: null } : c,
            );
            return data.disconnectOutcome ?? {};
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
        async listSkills() {
            return { skills: [...(data.skills?.skills ?? [])], invalid: { ...(data.skills?.invalid ?? {}) } };
        },
        async listFeaturedSkillLibraries() {
            return { libraries: [...(data.featuredLibraries?.libraries ?? [])] };
        },
        async previewSkillLink(url) {
            if (!data.linkPreview) throw new GaiaApiError(400, 'This fake client was given no link preview.');
            return data.linkPreview(url);
        },
        async getMemoryActivity(days) {
            memoryActivityReads.push(days);
            if (!data.memoryActivity) throw new GaiaApiError(503, 'This fake client was given no memory activity.');
            const rows = data.memoryActivity(days);
            if (rows instanceof Error) throw rows;
            return rows;
        },
        async getMemoryTools() {
            if (!data.memoryTools) throw new GaiaApiError(503, 'This fake client was given no memory tool stats.');
            if (data.memoryTools instanceof Error) throw data.memoryTools;
            return data.memoryTools;
        },
        async getMemoryUpcoming() {
            if (!data.memoryUpcoming) throw new GaiaApiError(503, 'This fake client was given no upcoming items.');
            if (data.memoryUpcoming instanceof Error) throw data.memoryUpcoming;
            return data.memoryUpcoming;
        },
        async listMemoryKnowledge(params) {
            if (data.memoryKnowledge instanceof Error) throw data.memoryKnowledge;
            const rows = knowledge
                .filter((item) => params.include_sensitive || !item.sensitive)
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
            const offset = params.offset ?? 0;
            return { items: rows.slice(offset, offset + (params.limit ?? rows.length)), total: rows.length };
        },
        async addMemoryKnowledge(body) {
            knowledgeCalls.push({ action: 'add', body });
            const now = new Date().toISOString();
            const knowledgeId = `fake-knowledge-${++knowledgeAdds}`;
            knowledge.push({
                id: knowledgeId,
                category: body.category ?? 'fact',
                content: body.content,
                domain: body.domain ?? null,
                source: 'user',
                context: body.context ?? 'global',
                entity: body.entity ?? null,
                sensitive: body.sensitive ?? false,
                created_at: now,
                updated_at: now,
                due_at: body.due_at ?? null,
            });
            return { status: 'stored', knowledge_id: knowledgeId };
        },
        async updateMemoryKnowledge(id, body) {
            knowledgeCalls.push({ action: 'update', id, body });
            const at = knowledge.findIndex((item) => item.id === id);
            if (at < 0) throw new GaiaApiError(404, `Knowledge entry ${id} not found`);
            knowledge[at] = { ...knowledge[at]!, ...body, updated_at: new Date().toISOString() } as MemoryKnowledgeItem;
            return { status: 'updated', knowledge_id: id };
        },
        async deleteMemoryKnowledge(id) {
            knowledgeCalls.push({ action: 'delete', id });
            if (!knowledge.some((item) => item.id === id)) throw new GaiaApiError(404, `Knowledge entry ${id} not found`);
            knowledge = knowledge.filter((item) => item.id !== id);
            return { status: 'deleted' };
        },
        async getMemoryStats() {
            if (!data.memoryStats?.length) throw new GaiaApiError(503, 'This fake client was given no memory stats.');
            return nextOf(data.memoryStats, memoryStatsReads++);
        },
        async getSettings() {
            if (!data.settings) throw new GaiaApiError(503, 'This fake client was given no settings.');
            return data.settings;
        },
        async setNetworkPolicy(policy) {
            if (!data.settings) throw new GaiaApiError(503, 'This fake client was given no settings.');
            if (data.networkPolicyError) throw data.networkPolicyError;
            data.settings = { ...data.settings, network_policy: policy };
            return data.settings;
        },
        async getUndoSettings() {
            if (!data.undoSettings) throw new GaiaApiError(503, 'This fake client was given no undo settings.');
            return data.undoSettings;
        },
        async updateUndoSettings(retentionDays, maxMb) {
            if (!data.undoSettings) throw new GaiaApiError(503, 'This fake client was given no undo settings.');
            data.undoSettings = { ...data.undoSettings, retention_days: retentionDays, max_mb: maxMb };
            return data.undoSettings;
        },
        async getMemorySettings() {
            if (!data.memorySettings) throw new GaiaApiError(503, 'This fake client was given no memory settings.');
            return data.memorySettings;
        },
        async updateMemorySettings(settings) {
            if (!data.memorySettings) throw new GaiaApiError(503, 'This fake client was given no memory settings.');
            if (data.memorySettingsError) throw data.memorySettingsError;
            data.memorySettings = { ...data.memorySettings, ...settings };
            return data.memorySettings;
        },
        async getEmbeddingCoverage() {
            if (!data.embeddingCoverage) throw new GaiaApiError(503, 'This fake client was given no embedding coverage.');
            return data.embeddingCoverage;
        },
        async consolidateMemory() {
            return memoryAction('consolidate', data.memoryActionResults?.consolidate ?? { status: 'ok', consolidated: 0, extracted_items: 0 });
        },
        async rebuildEmbeddings() {
            return memoryAction('rebuildEmbeddings', data.memoryActionResults?.rebuildEmbeddings ?? { backfilled: 0, total_without: 0 });
        },
        async reconcileMemory() {
            return memoryAction(
                'reconcile',
                data.memoryActionResults?.reconcile ?? { pairs_checked: 0, reinforced: 0, contradicted: 0, weakened: 0, neutral: 0 },
            );
        },
        async rebuildMemoryFts() {
            return memoryAction('rebuildFts', data.memoryActionResults?.rebuildFts ?? { status: 'ok' });
        },
        async refreshSystemContext() {
            return memoryAction('refreshSystemContext', data.memoryActionResults?.refreshSystemContext ?? { stored: 0, skipped: false });
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
        async listScheduleResults(name, limit) {
            findSchedule(name);
            const all = data.scheduleResults?.[name] ?? [];
            return { results: all.slice(0, limit), total: all.length };
        },
        async deleteSchedule(name) {
            const schedule = findSchedule(name);
            scheduleActions.push({ action: 'delete', name });
            schedules.splice(schedules.indexOf(schedule), 1);
            return { deleted: true };
        },
        async uploadDocument(file) {
            if (data.documentUploadError) throw data.documentUploadError;
            uploaded.push(file);
            const doc = {
                id: `doc-${uploaded.length}`,
                filename: file.name,
                filepath: `/managed/${file.name}`,
                file_size: file.size ?? 0,
                chunk_count: 1,
                indexed_at: new Date().toISOString(),
                indexing_status: data.uploadStatus ?? 'complete',
            } as DocumentResponse;
            library.documents.push(doc);
            library.total += 1;
            return doc;
        },
        async attachDocument(sessionId, docId) {
            findSession(sessionId);
            attached.push({ sessionId, docId });
        },
        async listDocuments() {
            return { ...library, documents: [...library.documents] };
        },
        async cancelDocumentIndexing(docId) {
            const doc = findDocument(docId, 'cancel');
            doc.indexing_status = 'cancelled';
            return { cancelled: true, id: docId };
        },
        async deleteDocument(docId) {
            const doc = findDocument(docId, 'delete');
            library.documents.splice(library.documents.indexOf(doc), 1);
            return { deleted: true };
        },
        async getDocumentStatus(docId) {
            const doc = library.documents.find((d) => d.id === docId);
            if (!doc) throw new GaiaApiError(404, 'Document not found');
            return {
                id: docId,
                indexing_status: doc.indexing_status ?? 'complete',
                chunk_count: doc.chunk_count,
                is_active: false,
                progress: null,
                ...data.documentStatuses?.[docId],
            };
        },
        async reindexDocument(docId) {
            const doc = findDocument(docId, 'reindex');
            doc.indexing_status = 'indexing';
            doc.last_error = null;
            doc.error_kind = null;
            return doc;
        },
        async getCapabilities(sessionId) {
            capabilityReads.push(sessionId);
            const found = data.capabilities?.[sessionId];
            if (!found) throw new GaiaApiError(409, "This chat's agent isn't running yet.");
            return found;
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
        async getGpuMemory() {
            if (!data.gpuMemory) throw new GaiaApiError(503, 'This fake client was given no GPU memory status.');
            if (data.gpuMemory instanceof Error) throw data.gpuMemory;
            return data.gpuMemory;
        },
        async getModelNeed(job) {
            return data.modelNeeds?.[job] ?? { job, needed: false, model: null, disk_free_gb: null };
        },
        async downloadSetupModel(modelId, acknowledgeLowDisk) {
            downloads.push({ modelId, acknowledgeLowDisk });
            return data.setupStatus ?? { state: 'running' };
        },
        async removeSetupModel(modelId) {
            removals.push(modelId);
            return { ...(data.setupPlan as SetupPlan), freed_gb: 0 };
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
        async listProviders() {
            if (!data.providers) throw new GaiaApiError(503, 'This fake client was given no providers.');
            return data.providers;
        },
        async getModelServer() {
            if (!data.modelServer) throw new GaiaApiError(503, 'This fake client was given no model server.');
            return data.modelServer;
        },
        async setModelServerBackend(backend) {
            backendSets.push(backend);
            return { ...(data.modelServer as ModelServerInfo), preferred_backend: backend };
        },
        async getPreflight() {
            if (!data.preflight) throw new GaiaApiError(503, 'This fake client was given no preflight.');
            if (data.preflight instanceof Error) throw data.preflight;
            return data.preflight;
        },
        async getLemonadeTarget() {
            if (!data.lemonadeTarget) throw new GaiaApiError(503, 'This fake client was given no model server target.');
            if (data.lemonadeTarget instanceof Error) throw data.lemonadeTarget;
            return data.lemonadeTarget;
        },
        async detectLemonade() {
            if (!data.lemonadeDetect) return { found: null };
            if (data.lemonadeDetect instanceof Error) throw data.lemonadeDetect;
            return data.lemonadeDetect;
        },
        async connectProvider(provider) {
            connects.push(provider);
            return { remembered: true };
        },
        async recheckSetupNpu() {
            npuRechecks += 1;
            if (data.npuRecheck instanceof Error) throw data.npuRecheck;
            if (!data.npuRecheck) throw new GaiaApiError(503, 'This fake client was given no NPU recheck plan.');
            return data.npuRecheck;
        },
        async getSetupPlan() {
            if (!data.setupPlan) throw new GaiaApiError(503, 'This fake client was given no setup plan.');
            return data.setupPlan;
        },
        async chooseSetupChatModel(modelId, acknowledgeNoFit) {
            setupChoices.push({ kind: 'chat', modelId, flag: acknowledgeNoFit });
            return data.setupPlan as SetupPlan;
        },
        async chooseSetupVisionModel(modelId) {
            setupChoices.push({ kind: 'vision', modelId });
            return data.setupPlan as SetupPlan;
        },
        async skipSetupModel(modelId, skipped) {
            setupChoices.push({ kind: 'skip', modelId, flag: skipped });
            return data.setupPlan as SetupPlan;
        },
        async startSetup(skipChatModel, gaiaLemonade = false, options = {}) {
            setupStarts.push({ skipChatModel, gaiaLemonade, upgradeEmbedded: !!options.upgradeEmbedded, serverOnly: !!options.serverOnly });
            return { state: 'running', upgrade_embedded: !!options.upgradeEmbedded };
        },
    };
}
