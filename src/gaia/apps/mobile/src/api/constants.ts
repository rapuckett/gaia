// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Not importable from webui (they live in services/api.ts and ChatView.tsx, with
// their logger and stores); api/constants.test.ts fails if any of these drifts.
export const UI_HEADERS = {
    'X-Gaia-UI': '1',
    'X-Gaia-Client': 'agent-ui',
} as const;

export const ENDPOINTS = {
    health: '/api/health',
    sessions: '/api/sessions',
    session: '/api/sessions/{session_id}',
    sessionMessages: '/api/sessions/{session_id}/messages',
    chatSend: '/api/chat/send',
    chatAttach: '/api/chat/attach',
    chatCancel: '/api/chat/cancel',
    chatConfirmTool: '/api/chat/confirm-tool',
    chatUserInput: '/api/chat/user-input',
    systemStatus: '/api/system/status',
    onboardingStart: '/api/onboarding/start',
} as const;

export function sessionPath(sessionId: string): string {
    return ENDPOINTS.session.replace('{session_id}', encodeURIComponent(sessionId));
}

export function sessionMessagesPath(sessionId: string): string {
    return ENDPOINTS.sessionMessages.replace('{session_id}', encodeURIComponent(sessionId));
}

export const SESSION_PAGE_SIZE = 200;
export const MESSAGE_PAGE_SIZE = 100;

/** The backend sends a keepalive every 5 s, so this much silence means the connection is gone. */
export const STREAM_IDLE_MS = 30_000;
/** A turn waiting for the model hears nothing until its place in line changes. */
export const QUEUED_IDLE_MS = 10 * 60_000;
/** The backend may hold a send for 60 s while another chat has the model, then answers 429. */
export const SEND_HEADER_TIMEOUT_MS = 90_000;
/** An attach replays at once; a slower answer means the backend is stuck or unreachable. */
export const ATTACH_HEADER_TIMEOUT_MS = 30_000;
/** How often to re-read the PC's status while it is still starting or warming up. */
export const STATUS_POLL_MS = 5_000;

/** Stream events that report the agent's activity rather than the answer's text. */
export const AGENT_EVENT_TYPES: ReadonlySet<string> = new Set([
    'status', 'step', 'thinking', 'commentary', 'plan',
    'tool_start', 'tool_end', 'tool_result', 'tool_args', 'tool_confirm', 'skill_use', 'agent_error',
    'permission_request', 'needs_confirmation', 'needs_input', 'policy_alert',
    'followup_taken', 'followup_returned', 'followup_unavailable', 'context_usage',
]);

/** Once the run reaches one of these, a permission prompt or question before it is no longer waiting. */
export const RESOLVES_PROMPTS: ReadonlySet<string> = new Set(['tool_start', 'tool_end', 'tool_result']);
