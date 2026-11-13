// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Not importable from webui (UI_HEADER lives in services/api.ts, with its logger and stores);
// api/constants.test.ts fails if any of these drifts from the backend or the web client.
export const UI_HEADERS = {
    'X-Gaia-UI': '1',
    'X-Gaia-Client': 'agent-ui',
} as const;

export const ENDPOINTS = {
    health: '/api/health',
    sessions: '/api/sessions',
    sessionMessages: '/api/sessions/{session_id}/messages',
    chatSend: '/api/chat/send',
    documentFile: '/api/documents/{doc_id}/file',
} as const;

export function sessionMessagesPath(sessionId: string): string {
    return ENDPOINTS.sessionMessages.replace('{session_id}', encodeURIComponent(sessionId));
}

/** The library file's URL, as the web UI's `documentFileUrl` builds it: the page rides in the fragment. */
export function documentFileUrl(baseUrl: string, docId: string, page?: number): string {
    const path = ENDPOINTS.documentFile.replace('{doc_id}', encodeURIComponent(docId));
    return `${baseUrl.replace(/\/+$/, '')}${path}${page ? `#page=${page}` : ''}`;
}

export const SESSION_PAGE_SIZE = 200;
export const MESSAGE_PAGE_SIZE = 100;
