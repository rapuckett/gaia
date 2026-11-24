// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AgentDownload } from '@/api/client.types';
import { AGENT_DOWNLOAD_POLL_MS } from '@/api/constants';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';

import { AGENT_PROGRAMS } from '../devScenes';
import { useAgentPickStore } from './agentPick';
import { useAgentFirst } from './useAgentFirst';

const done: AgentDownload = { state: 'done', bytes_done: 100, bytes_total: 100, error: null };
const failed: AgentDownload = { state: 'failed', bytes_done: 40, bytes_total: 100, error: 'connection reset' };

async function mount(data: FakeClientData) {
    const client = createFakeClient({ agentPrograms: AGENT_PROGRAMS, ...data });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
        </QueryClientProvider>
    );
    const { result } = await renderHook(() => useAgentFirst(), { wrapper });
    return { client, result };
}

const tick = () => act(async () => void (await jest.advanceTimersByTimeAsync(AGENT_DOWNLOAD_POLL_MS)));

describe("setup's picked agent", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        useAgentPickStore.setState({ pcId: null, pick: { id: 'gaiacpp', download: true, current: 'gaiapy' } });
    });
    afterEach(() => {
        jest.useRealTimers();
        useAgentPickStore.setState({ pcId: null, pick: null });
    });

    it('holds the run while gaiacpp downloads, then saves it and starts the run', async () => {
        const { client, result } = await mount({ agentDownloads: [done] });
        const run = jest.fn();
        await act(async () => void (await result.current.begin(run)));
        expect(result.current.held).toBe(true);
        expect(client.agentDownloadStarts).toBe(1);
        expect(run).not.toHaveBeenCalled();

        await tick();
        await tick();
        expect(client.flagshipAgentSets).toEqual(['gaiacpp']);
        expect(run).toHaveBeenCalledTimes(1);
        expect(result.current.held).toBe(false);
        expect(useAgentPickStore.getState().pick).toBeNull();
    });

    it('Carry on after a failed download starts the run on the agent in use and saves nothing', async () => {
        const { client, result } = await mount({ agentDownloads: [failed] });
        const run = jest.fn();
        await act(async () => void (await result.current.begin(run)));
        await tick();
        expect(result.current.job?.state).toBe('failed');
        expect(run).not.toHaveBeenCalled();

        await act(async () => result.current.carryOn());
        expect(run).toHaveBeenCalledTimes(1);
        expect(client.flagshipAgentSets).toEqual([]);
        expect(useAgentPickStore.getState().pick).toBeNull();
    });
});
