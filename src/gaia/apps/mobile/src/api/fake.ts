// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { GaiaClient, HealthResponse, Message, MessageList, Session, SessionList, StreamEvent } from './client.types';

export interface FakeClientData {
    sessions?: Session[];
    messages?: Record<string, Message[]>;
    replies?: StreamEvent[];
}

export interface FakeGaiaClient extends GaiaClient {
    readonly sent: { sessionId: string; message: string }[];
}

export function createFakeClient(data: FakeClientData = {}): FakeGaiaClient {
    const sessions = data.sessions ?? [];
    const messages = data.messages ?? {};
    const replies: StreamEvent[] = data.replies ?? [{ type: 'done' }];
    const sent: FakeGaiaClient['sent'] = [];

    return {
        sent,
        async health(): Promise<HealthResponse> {
            return { status: 'ok', service: 'gaia-agent-ui' };
        },
        async listSessions(): Promise<SessionList> {
            return { sessions, total: sessions.length };
        },
        async getMessages(sessionId): Promise<MessageList> {
            const list = messages[sessionId] ?? [];
            return { messages: list, total: list.length };
        },
        async *sendMessage(sessionId, message) {
            sent.push({ sessionId, message });
            yield* replies;
        },
    };
}
