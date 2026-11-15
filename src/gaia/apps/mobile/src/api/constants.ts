// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Not importable from webui (they live in services/api.ts and ChatView.tsx, with
// their logger and stores); api/constants.test.ts fails if any of these drifts.
export const UI_HEADERS = {
    'X-Gaia-UI': '1',
    'X-Gaia-Client': 'agent-ui',
} as const;

export const ENDPOINTS = {
    activeModel: '/api/providers/active',
    cloudPrices: '/api/spending/prices/{provider}',
    health: '/api/health',
    localModelContext: '/api/providers/local/context',
    localModelRestart: '/api/providers/local/restart',
    localModelStatus: '/api/providers/local/status',
    providerModels: '/api/providers/{provider}/models',
    providers: '/api/providers',
    providersSelect: '/api/providers/select',
    schedule: '/api/schedules/{name:path}',
    scheduleRun: '/api/schedules/{name:path}/run',
    scheduleParse: '/api/schedules/parse',
    schedules: '/api/schedules',
    sessions: '/api/sessions',
    session: '/api/sessions/{session_id}',
    sessionDocument: '/api/sessions/{session_id}/documents/{doc_id}',
    sessionMessages: '/api/sessions/{session_id}/messages',
    sessionMessagesAndBelow: '/api/sessions/{session_id}/messages/{message_id}/and-below',
    sessionPrivate: '/api/sessions/{session_id}/private',
    sessionSearch: '/api/sessions/search',
    setupCancel: '/api/setup/cancel',
    setupModelDownload: '/api/setup/models/download',
    setupNeeds: '/api/setup/needs/{job}',
    setupStatus: '/api/setup/status',
    chatSend: '/api/chat/send',
    chatAttach: '/api/chat/attach',
    chatCancel: '/api/chat/cancel',
    chatConfirmTool: '/api/chat/confirm-tool',
    chatFollowup: '/api/chat/followup',
    chatFollowupOutcome: '/api/chat/followup/{session_id}',
    chatUserInput: '/api/chat/user-input',
    connectors: '/api/connectors',
    connectorsAgentMcps: '/api/connectors/agent-mcps',
    systemResources: '/api/system/resources',
    systemStatus: '/api/system/status',
    documentFile: '/api/documents/{doc_id}/file',
    documents: '/api/documents',
    onboardingStart: '/api/onboarding/start',
} as const;

export function cloudPricesPath(provider: string): string {
    return ENDPOINTS.cloudPrices.replace('{provider}', encodeURIComponent(provider));
}

export function providerModelsPath(provider: string): string {
    return ENDPOINTS.providerModels.replace('{provider}', encodeURIComponent(provider));
}

export function schedulePath(name: string): string {
    return ENDPOINTS.schedule.replace('{name:path}', encodeURIComponent(name));
}

export function scheduleRunPath(name: string): string {
    return ENDPOINTS.scheduleRun.replace('{name:path}', encodeURIComponent(name));
}

export function setupNeedsPath(job: string): string {
    return ENDPOINTS.setupNeeds.replace('{job}', encodeURIComponent(job));
}

export function sessionPath(sessionId: string): string {
    return ENDPOINTS.session.replace('{session_id}', encodeURIComponent(sessionId));
}

export function followupOutcomePath(sessionId: string): string {
    return ENDPOINTS.chatFollowupOutcome.replace('{session_id}', encodeURIComponent(sessionId));
}

export function sessionDocumentPath(sessionId: string, docId: string): string {
    return ENDPOINTS.sessionDocument
        .replace('{session_id}', encodeURIComponent(sessionId))
        .replace('{doc_id}', encodeURIComponent(docId));
}

export function sessionPrivatePath(sessionId: string): string {
    return ENDPOINTS.sessionPrivate.replace('{session_id}', encodeURIComponent(sessionId));
}

export function sessionMessagesPath(sessionId: string): string {
    return ENDPOINTS.sessionMessages.replace('{session_id}', encodeURIComponent(sessionId));
}

export function sessionMessagesAndBelowPath(sessionId: string, messageId: number): string {
    return ENDPOINTS.sessionMessagesAndBelow
        .replace('{session_id}', encodeURIComponent(sessionId))
        .replace('{message_id}', String(messageId));
}

/** The library file's URL, as the web UI's `documentFileUrl` builds it: the page rides in the fragment. */
export function documentFileUrl(baseUrl: string, docId: string, page?: number): string {
    const path = ENDPOINTS.documentFile.replace('{doc_id}', encodeURIComponent(docId));
    return `${baseUrl.replace(/\/+$/, '')}${path}${page ? `#page=${page}` : ''}`;
}

/** Typing pauses this long before a search goes out; the web UI's `SEARCH_DEBOUNCE_MS`. */
export const SEARCH_DEBOUNCE_MS = 200;

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
/** How often to re-read the schedules while their screen is open, so counts and times follow the PC. */
export const SCHEDULES_POLL_MS = 10_000;
/** How long a Delete button waits for its "Confirm?" press; the web UI's CONFIRM_DELETE_MS. */
export const CONFIRM_DELETE_MS = 8000;
/** How often the model status pill re-reads the model server while its sheet is open, and while it is closed. */
export const MODEL_STATUS_OPEN_POLL_MS = 3_000;
export const MODEL_STATUS_POLL_MS = 15_000;
/** How often a model download's progress is read, and how many missing or failed reads end the wait. */
export const DOWNLOAD_POLL_MS = 1_000;
export const DOWNLOAD_NO_ROW_LIMIT = 15;
export const DOWNLOAD_MISS_LIMIT = 5;
/** The longest the model-needed check may take before the job goes ahead without it. */
export const MODEL_NEED_CHECK_LIMIT_MS = 8_000;
/** What the PC answers a log request from a phone; the model server log opens only on the PC (security.py). */
export const PC_ONLY_REFUSAL =
    "Do this on the PC running GAIA. It isn't allowed over mobile access, from a paired device or from another computer.";
/** How long to wait after a failed resource read before trying again (webui's `RETRY_MS`). */
export const RESOURCE_RETRY_MS = 5_000;
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
