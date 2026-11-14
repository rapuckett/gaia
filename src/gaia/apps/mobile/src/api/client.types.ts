// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FollowUpOutcome } from '@webui/utils/messageQueue';
import type {
    AgentMcpServer,
    ConnectorListEntry,
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    ParsedSchedule,
    ResourceUsage,
    Schedule,
    Session,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    SkillInfo,
    StartScreen,
    StreamEvent,
    SystemStatus,
} from '@webui/types';
import type { CreateSessionRequest, DocumentListResponse, SessionSearchResponse, ToolConfirmRequest, UserInputRequest as ApiUserInputRequest } from '@webui/types/api.gen';

export type {
    AgentMcpServer,
    ConnectorListEntry,
    ConnectorRow,
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    ParsedSchedule,
    ResourceUsage,
    Schedule,
    Session,
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
export type { CreateSessionRequest, DocumentListResponse, SessionSearchResponse, SessionSearchResult, ToolConfirmRequest } from '@webui/types/api.gen';

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

export interface RequestOptions {
    signal?: AbortSignal;
}

export interface GaiaClient {
    health(options?: RequestOptions): Promise<HealthResponse>;
    listSessions(options?: RequestOptions): Promise<SessionList>;
    getSession(sessionId: string, options?: RequestOptions): Promise<Session>;
    createSession(request?: CreateSessionRequest, options?: RequestOptions): Promise<Session>;
    /** What the chat's last finished turn did with the messages added to it; rejects with 409 while a turn still runs. */
    getFollowUpOutcome(sessionId: string, options?: RequestOptions): Promise<FollowUpOutcome>;
    /** Chats whose title or messages match `query`, newest first; `truncated` says the backend capped the list. */
    searchSessions(query: string, includeAutomated: boolean, options?: RequestOptions): Promise<SessionSearchResponse>;
    getMessages(sessionId: string, options?: RequestOptions): Promise<MessageList>;
    /** Renames a chat; the title is pinned against the auto-retitler. */
    updateSession(sessionId: string, update: SessionUpdate, options?: RequestOptions): Promise<Session>;
    /** Flips the chat's private mode (not saved to memory) and returns the chat. */
    toggleSessionPrivate(sessionId: string, options?: RequestOptions): Promise<Session>;
    /** Removes a document from this chat; the library keeps it. */
    detachDocument(sessionId: string, docId: string, options?: RequestOptions): Promise<void>;
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
    listConnectors(options?: RequestOptions): Promise<ConnectorList>;
    /** Servers that custom agents declare in their own mcp_servers.json; read-only. */
    listAgentMcps(options?: RequestOptions): Promise<AgentMcpList>;
    listSchedules(options?: RequestOptions): Promise<ScheduleList>;
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
    /** Stops one model's download; finished and partial files are kept. */
    cancelSetup(modelId: string, options?: RequestOptions): Promise<{ cancelled: boolean }>;
    /** The new-chat screen's cards and working folder; `skills_error` says why the assistant can't list its skills. */
    getStartScreen(options?: RequestOptions): Promise<StartScreen>;
    /** Is GAIA set up on this PC: ready, or the stage and reasons it is not. */
    checkSetup(skipChatModel: boolean, options?: RequestOptions): Promise<SetupCheck>;
    /** What setup will use and download, before it starts; `catalog` marks partial downloads. */
    getSetupPlan(options?: RequestOptions): Promise<SetupPlan>;
    startSetup(
        skipChatModel: boolean,
        gaiaLemonade?: boolean,
        options?: SetupRunOptions & RequestOptions,
    ): Promise<SetupRunStatus>;
}
