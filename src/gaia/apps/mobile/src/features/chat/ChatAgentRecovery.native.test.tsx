// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { AgentProblem, AgentPrograms, Message, StartScreen } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { MessageActionsContext } from './messages/MessageActionsContext';
import { SavedReplyErrors } from './ReplyErrors';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const MISSING: AgentProblem = { code: 'gaiacpp_missing', detail: 'gaiacpp is chosen as the agent but it is not installed on this PC.' };
const START: StartScreen = { cards: [], working_folder: { path: '/Users/Shared', name: 'Shared', gaia_folder: false, choosable: false } };
const LISTING: AgentPrograms = {
    current: 'gaiacpp',
    programs: [
        { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null },
        { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null },
    ],
    download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
};
const failed = (over: Partial<Message> = {}): Message => ({
    id: 7, session_id: 's', role: 'assistant', content: 'Error: the agent did not start', created_at: '2026-11-24T10:00:00Z', rag_sources: null, failed: true, ...over,
});

async function show(message: Message, data: Partial<FakeClientData>, { latest = true, busy = false } = {}) {
    const client = createFakeClient({ start: START, agentPrograms: LISTING, ...data });
    const retry = jest.fn(() => Promise.resolve(true));
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <ThemeProvider>
                    <MessageActionsContext.Provider value={{ send: () => true, retry, busy }}>
                        <SavedReplyErrors message={message} latest={latest} />
                    </MessageActionsContext.Provider>
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { client, retry };
}

describeNative('the agent recovery under a failed reply', () => {
    it('shows when the chosen agent cannot start', async () => {
        await show(failed(), { start: { ...START, agent_problem: MISSING } });
        expect(await screen.findByTestId('agent-recovery')).toBeTruthy();
    });

    it('shows nothing when the agent is not the reason', async () => {
        await show(failed(), {});
        await screen.findByTestId('try-again');
        expect(screen.queryByTestId('agent-recovery')).toBeNull();
    });

    it('is only under the newest failed reply', async () => {
        await show(failed(), { start: { ...START, agent_problem: MISSING } }, { latest: false });
        expect(screen.queryByTestId('agent-recovery')).toBeNull();
    });

    it('stays away while the model server is the cause', async () => {
        await show(failed({ failure: 'model_server_down' }), { start: { ...START, agent_problem: MISSING } });
        expect(screen.queryByTestId('agent-recovery')).toBeNull();
    });

    it('Use the Python agent saves gaiapy, then tries the failed reply again', async () => {
        const { client, retry } = await show(failed(), { start: { ...START, agent_problem: MISSING } });
        await fireEvent.press(await screen.findByTestId('agent-recovery-use-python'));
        await waitFor(() => expect(retry).toHaveBeenCalledWith(7));
        expect(client.flagshipAgentSets).toEqual(['gaiapy']);
    });

    it('comes after every button of the failed reply', async () => {
        await show(failed({ content: 'Error: the agent did not start. Log: /Users/a/.gaia/agents/gaia/logs' }), { start: { ...START, agent_problem: MISSING } });
        await screen.findByTestId('agent-recovery');
        const tree = JSON.stringify(screen.toJSON());
        const at = (id: string) => tree.indexOf(`"testID":"${id}"`);
        expect(at('try-again')).toBeGreaterThan(-1);
        expect(at('agent-log')).toBeGreaterThan(at('try-again'));
        expect(at('agent-recovery')).toBeGreaterThan(at('agent-log'));
    });
});
