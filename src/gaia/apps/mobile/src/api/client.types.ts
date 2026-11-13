// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message, Session, StreamEvent, SystemStatus } from '@webui/types';
import type { CreateSessionRequest, ToolConfirmRequest, UserInputRequest } from '@webui/types/api.gen';

export type { Message, Session, StreamEvent, SystemStatus } from '@webui/types';
export type { CreateSessionRequest, ToolConfirmRequest, UserInputRequest } from '@webui/types/api.gen';

export interface SessionList {
    sessions: Session[];
    total: number;
}

export interface MessageList {
    messages: Message[];
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

export interface UserInputResult {
    status: string;
    request_id: string;
}

export interface RequestOptions {
    signal?: AbortSignal;
}

export interface GaiaClient {
    health(options?: RequestOptions): Promise<HealthResponse>;
    listSessions(options?: RequestOptions): Promise<SessionList>;
    getSession(sessionId: string, options?: RequestOptions): Promise<Session>;
    createSession(request?: CreateSessionRequest, options?: RequestOptions): Promise<Session>;
    getMessages(sessionId: string, options?: RequestOptions): Promise<MessageList>;
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
    getSystemStatus(options?: RequestOptions): Promise<SystemStatus>;
}
