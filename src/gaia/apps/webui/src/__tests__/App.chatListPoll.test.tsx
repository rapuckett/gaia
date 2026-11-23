// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The chat list follows the server: an empty reply empties it, a failed read keeps it. */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api');
vi.mock('../components/SetupScreen', () => ({
    SetupScreen: () => <p>First-run setup</p>,
}));

import App from '../App';
import * as api from '../services/api';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import type { Session } from '../types';

const mocked = vi.mocked(api);

function statusSays(initialized: boolean) {
    mocked.getSystemStatus.mockResolvedValue({
        lemonade_running: true, model_loaded: 'x', initialized,
    } as never);
}

beforeEach(() => {
    vi.stubGlobal('EventSource', class {
        close() { /* noop */ }
        addEventListener() { /* noop */ }
    });
    mocked.getActiveModel.mockResolvedValue({
        provider: 'local', model: 'Gemma-4-E4B-it-GGUF', label: 'Gemma', remote: false, is_default: true,
    } as never);
    mocked.checkSetup.mockResolvedValue({ ready: true, steps: [] } as never);
    statusSays(true);
    mocked.listAgents.mockResolvedValue({ agents: [], total: 0 });
    mocked.listSessions.mockResolvedValue({ sessions: [], total: 0 });
    mocked.listAllPermissions.mockResolvedValue({ default_mode: 'ask', sessions: [] });
    mocked.getStartScreen.mockResolvedValue({ cards: [], working_folder: { path: '/w', name: 'w', gaia_folder: false, choosable: true } });
    mocked.listDocuments.mockResolvedValue({ documents: [] } as never);
    mocked.getActiveRuns.mockResolvedValue({ session_ids: [], queued: [], awaiting_user: {} });
    mocked.getTunnelStatus.mockResolvedValue({ active: false } as never);
    mocked.requestWarmUp.mockResolvedValue({ state: 'ready' });

    useModelStore.setState({ active: null, error: null, restoreNotice: null });
    useChatStore.setState({
        sessions: [], currentSessionId: null, messages: [], agents: [], pendingPrompt: null, systemStatus: null,
        backendConnected: true, showMemoryDashboard: false, showSchedules: false, settingsSection: null,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

const chat = { id: 'a', title: 'Only chat', created_at: '', updated_at: '', model: '', message_count: 1, document_ids: [] } as unknown as Session;

describe('chat list poll', () => {
    it('empties the list once the last chat is gone', async () => {
        mocked.listSessions.mockResolvedValue({ sessions: [chat], total: 1 });
        render(<App />);
        await advance(0);
        expect(useChatStore.getState().sessions).toHaveLength(1);

        mocked.listSessions.mockResolvedValue({ sessions: [], total: 0 });
        await advance(5_000);
        expect(useChatStore.getState().sessions).toEqual([]);
    });

    it('keeps the list when the read fails', async () => {
        mocked.listSessions.mockResolvedValue({ sessions: [chat], total: 1 });
        render(<App />);
        await advance(0);

        mocked.listSessions.mockRejectedValue(new Error('503'));
        await advance(5_000);
        expect(useChatStore.getState().sessions).toHaveLength(1);
    });
});
