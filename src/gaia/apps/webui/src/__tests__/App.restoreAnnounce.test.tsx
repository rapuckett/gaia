// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * The "model restored" toast is read aloud through the app's live announcer,
 * and carries no live role of its own.
 */

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api');

import App from '../App';
import * as api from '../services/api';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { announce } from '../test/announcerMock';

vi.mock('../components/LiveAnnouncer', () => import('../test/announcerMock'));

const mocked = vi.mocked(api);
const never = () => new Promise<never>(() => {});

beforeEach(() => {
    announce.mockClear();
    vi.stubGlobal('EventSource', class {
        close() { /* noop */ }
        addEventListener() { /* noop */ }
    });
    mocked.getActiveModel.mockImplementation(never);
    mocked.checkSetup.mockImplementation(never);
    mocked.getSystemStatus.mockResolvedValue({
        lemonade_running: false, lemonade_probe: 'timed_out', lemonade_error: 'Lemonade did not answer in time',
        model_loaded: null, initialized: true, init_state: 'degraded',
    } as never);
    mocked.listAgents.mockResolvedValue({ agents: [], total: 0 });
    mocked.listSessions.mockResolvedValue({ sessions: [], total: 0 } as never);
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

describe('the model-restored toast', () => {
    it('is announced once and keeps no live role of its own', async () => {
        useModelStore.setState({ restoreNotice: { ok: true } as never });
        render(<App />);
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });

        expect(announce).toHaveBeenCalledExactlyOnceWith('Restored your last model.');
        expect(document.querySelector('.app-restore-toast')).not.toBeNull();
        expect(document.querySelector('.app-restore-toast')).not.toHaveAttribute('role');
    });
});
