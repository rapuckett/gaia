// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FollowUpOutcome } from '@webui/utils/messageQueue';
import type {
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    Schedule,
    Session,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    StartScreen,
    StreamEvent,
    SystemStatus,
} from '@webui/types';
import type { CreateSessionRequest, SessionSearchResponse, ToolConfirmRequest, UserInputRequest as ApiUserInputRequest } from '@webui/types/api.gen';

export type {
    LocalModelStatus,
    Message,
    ModelNeed,
    ModelNeedJob,
    Schedule,
    Session,
    SetupCheck,
    SetupPlan,
    SetupRunStatus,
    StartScreen,
    StreamEvent,
    SystemStatus,
} from '@webui/types';
export type { CreateSessionRequest, SessionSearchResponse, SessionSearchResult, ToolConfirmRequest } from '@webui/types/api.gen';

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

export interface ScheduleList {
    schedules: Schedule[];
    total: number;
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
    listSchedules(options?: RequestOptions): Promise<ScheduleList>;
    /** Pauses or resumes a schedule; answers with the schedule as it now is. */
    updateScheduleStatus(name: string, status: 'active' | 'paused', options?: RequestOptions): Promise<Schedule>;
    /** Runs a schedule once now (409 while a run is in flight); its next scheduled run stays as it was. */
    runSchedule(name: string, options?: RequestOptions): Promise<Schedule>;
    deleteSchedule(name: string, options?: RequestOptions): Promise<DeleteScheduleResult>;
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
