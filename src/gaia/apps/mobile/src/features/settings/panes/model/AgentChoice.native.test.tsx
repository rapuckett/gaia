// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AgentDownload, AgentProgram, AgentPrograms } from '@/api/client.types';
import { AGENT_DOWNLOAD_POLL_MS, PC_ONLY_REFUSAL } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AgentChoice } from './AgentChoice';
import { blockedLine } from './agentText';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const PY: AgentProgram = { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null };
const CPP: AgentProgram = { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null };
const IDLE: AgentDownload = { state: 'idle', bytes_done: 0, bytes_total: null, error: null };
const listing = (cpp: Partial<AgentProgram> = {}, extra: Partial<AgentPrograms> = {}): AgentPrograms => ({
    current: 'gaiapy', programs: [PY, { ...CPP, ...cpp }], download: IDLE, ...extra,
});
const running = (bytes_done: number, state: AgentDownload['state'] = 'downloading'): AgentDownload => ({ state, bytes_done, bytes_total: 100, error: null });

async function mount(data: FakeClientData) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<AgentChoice inSettings />, { wrapper: wrap });
    return client;
}

const tick = () => act(async () => void (await jest.advanceTimersByTimeAsync(AGENT_DOWNLOAD_POLL_MS)));

describe('why gaiacpp is blocked', () => {
    it.each([
        ['no_release', null, /this GAIA release has no gaiacpp to download/, undefined],
        ['unreachable', 'GAIA could not reach the download server.', /couldn't get gaiacpp's details from the download server/, undefined],
        ['unverifiable', 'Checksum list unsigned.', /can't be verified, so GAIA won't install it/, undefined],
        [null, 'No gaiacpp build for linux-riscv64.', /isn't installed on (this|your) PC, so it can't be picked/, 'No gaiacpp build for linux-riscv64.'],
        [null, null, /isn't installed on (this|your) PC, so it can't be picked/, undefined],
    ] as const)('code %s, reason %s', (code, reason, text, detail) => {
        const line = blockedLine({ ...CPP, can_download: false, unavailable_code: code, unavailable_reason: reason }, t);
        expect(line.text).toMatch(text);
        expect(line.detail).toBe(detail);
    });
});

describeNative('AgentChoice in Settings', () => {
    afterEach(() => jest.useRealTimers());

    it('switches to gaiacpp once a download started here finishes', async () => {
        jest.useFakeTimers();
        const client = await mount({ agentPrograms: listing(), agentDownloads: [running(50), running(100, 'done')] });
        await fireEvent.press(await screen.findByTestId('agent-choice-download'));
        expect(client.agentDownloadStarts).toBe(1);
        await tick();
        expect(screen.getByTestId('agent-download-row')).toBeTruthy();
        await tick();
        await tick();
        expect(client.flagshipAgentSets).toEqual(['gaiacpp']);
        expect(screen.getByRole('radio', { name: /gaiacpp/, checked: true })).toBeTruthy();
    });

    it('follows a download the PC started, and does not switch when it finishes', async () => {
        jest.useFakeTimers();
        const client = await mount({ agentPrograms: listing({}, { download: running(10) }), agentDownloads: [running(100, 'done')] });
        expect(await screen.findByTestId('agent-download-row')).toBeTruthy();
        await tick();
        await tick();
        expect(client.agentDownloadStarts).toBe(0);
        expect(client.flagshipAgentSets).toEqual([]);
    });

    it('says the download stopped when the PC restarted, with Retry', async () => {
        jest.useFakeTimers();
        await mount({ agentPrograms: listing({}, { download: running(30) }), agentDownloads: [IDLE] });
        await screen.findByTestId('agent-download-row');
        await tick();
        expect(screen.getByText(t('setup.agent.downloadInterrupted'))).toBeTruthy();
        expect(screen.getByTestId('agent-download-retry')).toBeTruthy();
    });

    it('shows a saved agent this version cannot run with nothing selected', async () => {
        await mount({ agentPrograms: listing({ installed: true, can_download: false }, { current: 'gaiacode' }) });
        expect(await screen.findByRole('radio', { name: /gaiapy/ })).toBeTruthy();
        expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    });

    it('a switch the PC refuses goes back to the agent before and says it is done on the PC, not an error', async () => {
        const client = await mount({ agentPrograms: listing({ installed: true, can_download: false }), flagshipAgentError: new GaiaApiError(403, PC_ONLY_REFUSAL) });
        await fireEvent.press(await screen.findByTestId('agent-choice-gaiacpp'));
        expect(await screen.findByTestId('agent-choice-save-pc-only')).toBeTruthy();
        expect(client.flagshipAgentSets).toEqual(['gaiacpp']);
        expect(screen.getByRole('radio', { name: /gaiapy/, checked: true })).toBeTruthy();
        expect(screen.queryByText(/Couldn't switch the agent/)).toBeNull();
    });

    it('a refused Download puts the button back and says it is done on the PC', async () => {
        await mount({ agentPrograms: listing(), agentDownloadStart: new GaiaApiError(403, PC_ONLY_REFUSAL) });
        await fireEvent.press(await screen.findByTestId('agent-choice-download'));
        expect(await screen.findByTestId('agent-choice-download-pc-only')).toBeTruthy();
        expect(screen.getByTestId('agent-choice-download')).toBeTruthy();
        expect(screen.queryByTestId('agent-download-row')).toBeNull();
    });
});
