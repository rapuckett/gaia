// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { AgentDownload, AgentPrograms } from '@/api/client.types';
import { AGENT_DOWNLOAD_POLL_MS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';

import { agentProgramKeys, useAgentDownload, useSetFlagshipAgent } from './agentPrograms';
import { GaiaClientProvider } from './GaiaClientProvider';

const at = (bytes_done: number, state: AgentDownload['state'] = 'downloading'): AgentDownload => ({ state, bytes_done, bytes_total: 100, error: null });
const LISTING: AgentPrograms = {
    current: 'gaiapy',
    programs: [
        { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null },
        { id: 'gaiacpp', installed: false, size_bytes: 100, can_download: true, unavailable_reason: null },
    ],
    download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
};

function mount<T>(data: FakeClientData, hook: () => T) {
    const client = createFakeClient({ agentPrograms: LISTING, ...data });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, queryClient, rendered: renderHook(hook, { wrapper }) };
}

const tick = (ms = AGENT_DOWNLOAD_POLL_MS) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

describe('the gaiacpp download', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('reads once a second while it runs and calls onDone once, as started here', async () => {
        const onDone = jest.fn();
        const { client, rendered } = mount({ agentDownloads: [at(40), at(100, 'done')] }, () => useAgentDownload(onDone));
        const { result } = await rendered;
        await act(async () => void (await result.current.start()));
        expect(client.agentDownloadStarts).toBe(1);
        expect(result.current.job?.state).toBe('downloading');

        await tick(AGENT_DOWNLOAD_POLL_MS - 1);
        expect(result.current.job?.bytes_done).toBe(0);
        await tick(1);
        expect(result.current.job?.bytes_done).toBe(40);
        await tick();
        expect(result.current.job?.state).toBe('done');
        await tick();
        await tick();
        expect(onDone).toHaveBeenCalledTimes(1);
        expect(onDone).toHaveBeenCalledWith(true);
    });

    it('says a followed download was not started here', async () => {
        const onDone = jest.fn();
        const { rendered } = mount({ agentDownloads: [at(100, 'done')] }, () => useAgentDownload(onDone));
        const { result } = await rendered;
        await act(async () => result.current.follow(at(10)));
        await tick();
        expect(onDone).toHaveBeenCalledWith(false);
    });

    it('fails as interrupted when the PC answers idle mid-download, and keeps the bytes it had', async () => {
        const { rendered } = mount({ agentDownloads: [at(30), { state: 'idle', bytes_done: 0, bytes_total: null, error: null }] }, () => useAgentDownload(jest.fn()));
        const { result } = await rendered;
        await act(async () => void (await result.current.start()));
        await tick();
        await tick();
        expect(result.current.job).toMatchObject({ state: 'failed', bytes_done: 30 });
        expect(result.current.interrupted).toBe(true);

        await act(async () => void (await result.current.start()));
        expect(result.current.interrupted).toBe(false);
    });

    it('fails with the error of a read that failed, and stops reading', async () => {
        const lost = new GaiaApiError(500, 'download state unreadable');
        const { client, rendered } = mount({ agentDownloads: [lost] }, () => useAgentDownload(jest.fn()));
        const reads = jest.spyOn(client, 'getAgentDownload');
        const { result } = await rendered;
        await act(async () => void (await result.current.start()));
        await tick();
        expect(result.current.job?.state).toBe('failed');
        expect(result.current.failure).toBe(lost);
        await tick();
        await tick();
        expect(reads).toHaveBeenCalledTimes(1);
    });
});

describe('saving the agent program', () => {
    it.each([
        [403, 'Do this on the PC running GAIA.'],
        [409, 'GAIA is answering in a chat.'],
        [422, 'gaiacpp is not installed on this PC.'],
    ])('a %i saved nothing: the listing goes back to the agent before and is not read again', async (status, detail) => {
        const { client, queryClient, rendered } = mount({ flagshipAgentError: new GaiaApiError(status, detail) }, () => useSetFlagshipAgent());
        queryClient.setQueryData(agentProgramKeys.list, LISTING);
        const reads = jest.spyOn(client, 'getAgentPrograms');
        const { result } = await rendered;
        await act(async () => void (await result.current.mutateAsync('gaiacpp').catch(() => undefined)));
        expect(client.flagshipAgentSets).toEqual(['gaiacpp']);
        expect(queryClient.getQueryData<AgentPrograms>(agentProgramKeys.list)?.current).toBe('gaiapy');
        expect(reads).not.toHaveBeenCalled();
    });

    it('any other failure reads the listing again for what the PC holds', async () => {
        const { queryClient, rendered } = mount({ flagshipAgentError: new GaiaApiError(500, 'config write failed') }, () => useSetFlagshipAgent());
        queryClient.setQueryData(agentProgramKeys.list, LISTING);
        const { result } = await rendered;
        await act(async () => void (await result.current.mutateAsync('gaiacpp').catch(() => undefined)));
        expect(queryClient.getQueryState(agentProgramKeys.list)?.isInvalidated).toBe(true);
    });
});
