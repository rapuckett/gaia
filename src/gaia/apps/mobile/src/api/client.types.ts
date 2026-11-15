// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FollowUpOutcome } from '@webui/utils/messageQueue';
import type {
    ActiveModel,
    AgentInfo,
    AgentMcpServer,
    ChatPerformance,
    CloudPriceList,
    ConnectorListEntry,
    ContextChoice,
    ContextUsageResult,
    LemonadeFound,
    LemonadeTarget,
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    PermissionMode,
    PreflightReport,
    ProvidersResponse,
    ParsedSchedule,
    ProviderModelsResponse,
    ResourceUsage,
    Schedule,
    ScheduleResult,
    Session,
    SessionPermissions,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    SkillInfo,
    StartScreen,
    StreamEvent,
    SystemStatus,
} from '@webui/types';
import type { AgentCapabilities } from '@webui/types/sessionPanel';
import type { MemorySettings } from '@webui/services/memoryApi';
import type { CreateSessionRequest, DocumentListResponse, ModelServerInfo, SessionSearchResponse, ToolConfirmRequest, UserInputRequest as ApiUserInputRequest } from '@webui/types/api.gen';

export type {
    ActiveModel,
    AgentInfo,
    AgentMcpServer,
    ChatPerformance,
    CloudPriceList,
    ConnectorListEntry,
    ConnectorRow,
    ContextChoice,
    ContextUsage,
    ContextUsageResult,
    LemonadeFound,
    LemonadeTarget,
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    PermissionMode,
    PreflightReport,
    ProvidersResponse,
    ParsedSchedule,
    ProviderId,
    ProviderInfo,
    ProviderModel,
    ProviderModelsResponse,
    ResourceUsage,
    Schedule,
    ScheduleResult,
    Session,
    SessionPermissions,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    SkillInfo,
    SkillSource,
    StartScreen,
    StreamEvent,
    SystemStatus,
    UnavailableConnectorRow,
} from '@webui/types';
export type { ActiveSkill, AgentCapabilities, AgentTool, SkillOrigin } from '@webui/types/sessionPanel';
export type { CreateSessionRequest, DocumentListResponse, ModelServerInfo, SessionSearchResponse, SessionSearchResult, ToolConfirmRequest } from '@webui/types/api.gen';

/** `display` is what the phone shows as the answer; it is never sent to GAIA. */
export type UserInputRequest = ApiUserInputRequest & { display?: string };

export interface SessionList {
    sessions: Session[];
    total: number;
}

export interface MessageList {
    messages: Message[];
    total: number;
}

export interface ConnectorList {
    connectors: ConnectorListEntry[];
}

export interface AgentList {
    agents: AgentInfo[];
}

/** Namespaced agent ids to the scopes granted to them. */
export interface ConnectorGrants {
    grants: Record<string, string[]>;
}

/** Namespaced agent ids to whether the agent may use the connector's tools. */
export interface ConnectorActivations {
    activations: Record<string, boolean>;
}

/** `invalid` maps each unreadable skill's path to why GAIA skipped it. */
export interface SkillList {
    skills: SkillInfo[];
    invalid: Record<string, string>;
}

export interface AgentMcpList {
    agent_mcps: AgentMcpServer[];
}

export interface ScheduleList {
    schedules: Schedule[];
    total: number;
}

export type { MemorySettings } from '@webui/services/memoryApi';

/** GET /api/memory/embedding-coverage; typed as the web's `MemoryDashboard` types it. */
export interface EmbeddingCoverage {
    total_items: number;
    with_embedding: number;
    without_embedding: number;
    coverage_pct: number;
}

/** GET /api/memory/stats. The web types it inside `MemoryDashboard.tsx`; the generated API types leave it out. */
export interface MemoryStats {
    knowledge: {
        total: number;
        total_retrievals: number;
        by_category: Record<string, number>;
        by_context: Record<string, number>;
        sensitive_count: number;
        entity_count: number;
        avg_confidence: number;
        oldest: string | null;
        newest: string | null;
    };
    conversations: {
        total_turns: number;
        total_sessions: number;
        consolidated_sessions?: number;
        first_session: string | null;
        last_session: string | null;
    };
    tools: {
        total_calls: number;
        unique_tools: number;
        overall_success_rate: number;
        total_errors: number;
    };
    temporal: {
        upcoming_count: number;
        overdue_count: number;
    };
    /** Null when the coverage query failed; `embedding_error` says why. */
    embedding?: EmbeddingCoverage | null;
    embedding_error?: string;
    db_size_bytes: number;
}

export interface ConsolidateMemoryResult {
    status: string;
    consolidated: number;
    extracted_items: number;
}

export interface RebuildEmbeddingsResult {
    backfilled: number;
    total_without: number;
}

export interface ReconcileMemoryResult {
    pairs_checked: number;
    reinforced: number;
    contradicted: number;
    weakened: number;
    neutral: number;
}

export interface RefreshSystemContextResult {
    stored: number;
    skipped: boolean;
    reason?: string;
}

export interface SessionUpdate {
    title?: string;
    title_is_custom?: boolean;
}

export interface HealthResponse {
    status: string;
    service: string;
    stats?: Record<string, unknown>;
}

// These routes declare no response model, so api.gen.ts has none; the shapes are what they return.
export interface CancelChatResult {
    status: string;
    cancelled: boolean;
}

export interface ConfirmToolResult {
    status: string;
    approved: boolean;
    /** What "always allow" granted, or null. */
    granted: string | null;
}

export interface DeleteMessagesResult {
    deleted: boolean;
    count: number;
}

export interface DeleteSessionResult {
    deleted: boolean;
}

export interface UserInputResult {
    status: string;
    request_id: string;
}

/** What `POST /api/setup/run` takes; the web UI's `SetupRunOptions` (services/setupApi.ts). */
export interface SetupRunOptions {
    acknowledgeLowDisk?: boolean;
    keepTrying?: boolean;
    extraModels?: string[];
    serverOnly?: boolean;
    /** Replace GAIA's older embedded Lemonade without downloading models again. */
    upgradeEmbedded?: boolean;
}

export interface CreateScheduleRequest {
    name: string;
    interval: string;
    prompt: string;
    /** IANA zone the times are in; the device's. */
    timezone?: string;
}

export interface ScheduleResults {
    results: ScheduleResult[];
    total: number;
}

export interface DeleteScheduleResult {
    deleted: boolean;
}

export interface RestartModelResult {
    status: string;
    model: string;
    starting_server: boolean;
}

export interface FollowUpResult {
    delivered: boolean;
}

export type { FollowUpOutcome };

/** What the PC answers an upload with; `url` is the link a message carries so the agent can read the file. */
export interface UploadedFile {
    filename: string;
    original_name: string;
    url: string;
    size: number;
    content_type: string;
    is_image: boolean;
}

export interface RequestOptions {
    signal?: AbortSignal;
}

export interface GaiaClient {
    health(options?: RequestOptions): Promise<HealthResponse>;
    listSessions(options?: RequestOptions): Promise<SessionList>;
    getSession(sessionId: string, options?: RequestOptions): Promise<Session>;
    createSession(request?: CreateSessionRequest, options?: RequestOptions): Promise<Session>;
    /** Sends a file to the PC; recordings go to the transcription folder. Rejects with the PC's refusal (type, size, empty). */
    uploadFile(file: Blob, name: string, options?: RequestOptions): Promise<UploadedFile>;
    setSessionPinned(sessionId: string, pinned: boolean, options?: RequestOptions): Promise<Session>;
    /** Deletes the chat and its messages; a turn still running on it is stopped first. */
    deleteSession(sessionId: string, options?: RequestOptions): Promise<DeleteSessionResult>;
    /** Clears the chat's unread mark. */
    markSessionRead(sessionId: string, options?: RequestOptions): Promise<Session>;
    /** The model new chats run on and where it runs. */
    getActiveModel(options?: RequestOptions): Promise<ActiveModel>;
    getContextChoice(model: string, options?: RequestOptions): Promise<ContextChoice>;
    /** Remembers a context size for a local model; null returns it to Automatic. */
    setContextChoice(model: string, ctxSize: number | null, options?: RequestOptions): Promise<ContextChoice>;
    /** A cloud provider's list prices, readable before it is connected. */
    getCloudPrices(provider: string, options?: RequestOptions): Promise<CloudPriceList>;
    /** One provider's chat models; `local` also carries each one's state, size and download. */
    listProviderModels(provider: string, options?: RequestOptions): Promise<ProviderModelsResponse>;
    /** Makes `model` the one new messages use; a cloud model is picked after the person agrees to what leaves the PC. */
    selectModel(model: string, options?: RequestOptions): Promise<ActiveModel>;
    /** The chat's permission mode and the tools it always allows. */
    getPermissions(sessionId: string, options?: RequestOptions): Promise<SessionPermissions>;
    setPermissionMode(sessionId: string, mode: PermissionMode, options?: RequestOptions): Promise<SessionPermissions>;
    /** How full the model's context window is for the chat's next message, or why there is no reading yet. */
    getContextUsage(sessionId: string, options?: RequestOptions): Promise<ContextUsageResult>;
    /** Where each answer's time and tokens went, and the model as Lemonade reports it now. */
    getChatPerformance(sessionId: string, options?: RequestOptions): Promise<ChatPerformance>;
    /** What the chat's last finished turn did with the messages added to it; rejects with 409 while a turn still runs. */
    getFollowUpOutcome(sessionId: string, options?: RequestOptions): Promise<FollowUpOutcome>;
    /** Chats whose title or messages match `query`, newest first; `truncated` says the backend capped the list. */
    searchSessions(query: string, includeAutomated: boolean, options?: RequestOptions): Promise<SessionSearchResponse>;
    getMessages(sessionId: string, options?: RequestOptions): Promise<MessageList>;
    /** Removes only this message. */
    deleteMessage(sessionId: string, messageId: number, options?: RequestOptions): Promise<{ deleted: boolean }>;
    /** Renames a chat; the title is pinned against the auto-retitler. */
    updateSession(sessionId: string, update: SessionUpdate, options?: RequestOptions): Promise<Session>;
    /** Flips the chat's private mode (not saved to memory) and returns the chat. */
    toggleSessionPrivate(sessionId: string, options?: RequestOptions): Promise<Session>;
    /** Removes a document from this chat; the library keeps it. */
    detachDocument(sessionId: string, docId: string, options?: RequestOptions): Promise<void>;
    /** The tools and skills of the chat's running agent; rejects with 409 until the agent has started. */
    getCapabilities(sessionId: string, options?: RequestOptions): Promise<AgentCapabilities>;
    /** This PC's CPU, memory, GPU, NPU and network use. */
    getResourceUsage(options?: RequestOptions): Promise<ResourceUsage>;
    /** Deletes the message and everything after it, so the exchange can be asked again. */
    deleteMessagesFrom(sessionId: string, messageId: number, options?: RequestOptions): Promise<DeleteMessagesResult>;
    /** Hands a message to the running turn, read at its next step; rejects when the turn can't take it. */
    sendFollowUp(sessionId: string, text: string, options?: RequestOptions): Promise<FollowUpResult>;
    /** Starts a turn and streams it to its `done` or `error` event. */
    sendMessage(sessionId: string, message: string, options?: RequestOptions): AsyncIterable<StreamEvent>;
    /**
     * Streams the chat's running turn: every event so far, then the live ones.
     * Ends at once, with no events, when no turn is running.
     * Aborting only stops this phone's view; the turn goes on on the PC.
     */
    attachToRun(sessionId: string, options?: RequestOptions): AsyncIterable<StreamEvent>;
    /** Asks GAIA to stop the chat's turn; the turn's stream then ends with a cancelled `done`. */
    cancelChat(sessionId: string, options?: RequestOptions): Promise<CancelChatResult>;
    /** Answers a `permission_request`: allow once, always allow this call in this chat, or deny. */
    confirmTool(request: ToolConfirmRequest, options?: RequestOptions): Promise<ConfirmToolResult>;
    /** Answers a `needs_input` question; the turn continues once GAIA has it. */
    sendUserInput(request: UserInputRequest, options?: RequestOptions): Promise<UserInputResult>;
    listAgents(options?: RequestOptions): Promise<AgentList>;
    /**
     * Streams events about the PC's chat list, such as `set_active_session`. Never ends on its own:
     * it throws when the connection drops or goes silent, and the caller reconnects.
     */
    watchSessionEvents(options?: RequestOptions): AsyncIterable<StreamEvent>;
    listConnectors(options?: RequestOptions): Promise<ConnectorList>;
    listConnectorGrants(connectorId: string, options?: RequestOptions): Promise<ConnectorGrants>;
    listConnectorActivations(connectorId: string, options?: RequestOptions): Promise<ConnectorActivations>;
    /** Sets the scopes an agent holds on a connector; the PC answers 400 for a scope past what the connector allows. */
    grantConnectorAgent(connectorId: string, agentId: string, scopes: string[], options?: RequestOptions): Promise<void>;
    /** Removes an agent's grant on a connector. */
    revokeConnectorAgentGrant(connectorId: string, agentId: string, options?: RequestOptions): Promise<void>;
    /** Lets an agent use an MCP server's tools; `scopes` creates the grant when the agent has none. */
    activateConnectorAgent(connectorId: string, agentId: string, scopes?: string[], options?: RequestOptions): Promise<void>;
    /** Hides an MCP server's tools from an agent; its grant stays. */
    deactivateConnectorAgent(connectorId: string, agentId: string, options?: RequestOptions): Promise<void>;
    /** Servers that custom agents declare in their own mcp_servers.json; read-only. */
    listAgentMcps(options?: RequestOptions): Promise<AgentMcpList>;
    listSchedules(options?: RequestOptions): Promise<ScheduleList>;
    getMemoryStats(options?: RequestOptions): Promise<MemoryStats>;
    getMemorySettings(options?: RequestOptions): Promise<MemorySettings>;
    getEmbeddingCoverage(options?: RequestOptions): Promise<EmbeddingCoverage>;
    /** Folds finished chats into lasting memory. */
    consolidateMemory(options?: RequestOptions): Promise<ConsolidateMemoryResult>;
    /** Embeds the entries that have no embedding yet. */
    rebuildEmbeddings(options?: RequestOptions): Promise<RebuildEmbeddingsResult>;
    /** Checks pairs of memories against each other for support or contradiction. */
    reconcileMemory(options?: RequestOptions): Promise<ReconcileMemoryResult>;
    rebuildMemoryFts(options?: RequestOptions): Promise<{ status: string }>;
    /** Re-reads this PC's facts into memory; `skipped` when system context collection is off. */
    refreshSystemContext(options?: RequestOptions): Promise<RefreshSystemContextResult>;
    /** Every skill GAIA can load, plus the folders it skipped. */
    listSkills(options?: RequestOptions): Promise<SkillList>;
    /** Creates a schedule; `interval` is the plain-words "when to run", parsed by the PC. 409 when the name is taken. */
    createSchedule(request: CreateScheduleRequest, options?: RequestOptions): Promise<Schedule>;
    /** Reads a plain-words "when to run" without saving it, for the form's live preview. */
    parseSchedule(input: string, timezone: string | undefined, options?: RequestOptions): Promise<ParsedSchedule>;
    /** Pauses or resumes a schedule; answers with the schedule as it now is. */
    updateScheduleStatus(name: string, status: 'active' | 'paused', options?: RequestOptions): Promise<Schedule>;
    /** Runs a schedule once now (409 while a run is in flight); its next scheduled run stays as it was. */
    runSchedule(name: string, options?: RequestOptions): Promise<Schedule>;
    deleteSchedule(name: string, options?: RequestOptions): Promise<DeleteScheduleResult>;
    /** A schedule's most recent runs, newest first. */
    listScheduleResults(name: string, limit: number, options?: RequestOptions): Promise<ScheduleResults>;
    /** The library's documents; a chat searches only the ones attached to it. */
    listDocuments(options?: RequestOptions): Promise<DocumentListResponse>;
    getSystemStatus(options?: RequestOptions): Promise<SystemStatus>;
    /** The model server's state, what it runs on and its memory; the pill and its sheet read it. */
    getLocalModelStatus(options?: RequestOptions): Promise<LocalModelStatus>;
    /** Starts the model server if stopped, then reloads the chat model. `confirm` agrees to reload a Lemonade GAIA doesn't own. */
    restartLocalModel(confirm: boolean, options?: RequestOptions): Promise<RestartModelResult>;
    /** Whether a job needs a model that isn't on the PC, and which. */
    getModelNeed(job: ModelNeedJob, options?: RequestOptions): Promise<ModelNeed>;
    /** Starts one model's download on the PC; follow it with `getSetupStatus`. */
    downloadSetupModel(modelId: string, acknowledgeLowDisk: boolean, options?: RequestOptions): Promise<SetupRunStatus>;
    getSetupStatus(options?: RequestOptions): Promise<SetupRunStatus>;
    /** Stops one model's download, or the whole run without a model; finished and partial files are kept. */
    cancelSetup(modelId?: string, options?: RequestOptions): Promise<{ cancelled: boolean }>;
    /** The new-chat screen's cards and working folder; `skills_error` says why the assistant can't list its skills. */
    getStartScreen(options?: RequestOptions): Promise<StartScreen>;
    /** Is GAIA set up on this PC: ready, or the stage and reasons it is not. */
    checkSetup(skipChatModel: boolean, options?: RequestOptions): Promise<SetupCheck>;
    /** This PC's memory, disk, GPU and NPU as setup reads them. */
    getPreflight(options?: RequestOptions): Promise<PreflightReport>;
    /** The cloud providers; `blocked` is set on each while Local only is on. */
    listProviders(options?: RequestOptions): Promise<ProvidersResponse>;
    /** The model server GAIA uses: whether it answers, and the llama.cpp backends it lists and prefers. */
    getModelServer(options?: RequestOptions): Promise<ModelServerInfo>;
    /** Saves the llama.cpp backend for chat models (`auto` or a backend name); PC-only. */
    setModelServerBackend(backend: string, options?: RequestOptions): Promise<ModelServerInfo>;
    /** Which model server GAIA uses, and whether the PC still has to choose one. */
    getLemonadeTarget(options?: RequestOptions): Promise<LemonadeTarget>;
    /** A model server the PC already runs; `unchecked` lists addresses that took the connection but didn't answer. */
    detectLemonade(options?: RequestOptions): Promise<{ found: LemonadeFound | null; unchecked?: string[] }>;
    /** What setup will use and download, before it starts; `catalog` marks partial downloads. */
    getSetupPlan(options?: RequestOptions): Promise<SetupPlan>;
    startSetup(
        skipChatModel: boolean,
        gaiaLemonade?: boolean,
        options?: SetupRunOptions & RequestOptions,
    ): Promise<SetupRunStatus>;
}
