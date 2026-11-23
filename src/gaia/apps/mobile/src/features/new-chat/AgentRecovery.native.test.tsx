// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AgentProblem, AgentProgram, AgentPrograms, StartScreen, SystemStatus } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { AgentRecovery } from './AgentRecovery';
import { NewChatScreen } from './NewChatScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const READY = { lemonade_running: true, context_size_sufficient: true, init_state: 'ready', model_loaded: 'Gemma-4-E4B-it-GGUF' } as unknown as SystemStatus;
const MISSING: AgentProblem = { code: 'gaiacpp_missing', detail: 'gaiacpp is chosen as the agent but it is not installed on this PC.' };
const INVALID: AgentProblem = { code: 'gaiacpp_invalid', detail: 'gaiacpp no longer matches its download.' };
const START: StartScreen = { cards: [], working_folder: { path: '/Users/Shared', name: 'Shared', gaia_folder: false, choosable: false } };
const PY: AgentProgram = { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null };
const CPP: AgentProgram = { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null };
const listing = (py: Partial<AgentProgram> = {}, cpp: Partial<AgentProgram> = {}): AgentPrograms => ({
    current: 'gaiacpp', programs: [{ ...PY, ...py }, { ...CPP, ...cpp }], download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
});

function wrapper(data: FakeClientData) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <UIProvider>{children}</UIProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
    return { client, wrap };
}

describeNative('the new chat when the chosen agent cannot start', () => {
    it.each([
        [MISSING, /the agent you chose, isn't on (this|your) PC/],
        [INVALID, /the agent you chose, failed its check/],
    ] as const)('shows the card in place of "assistant unavailable" (%#)', async (problem, title) => {
        const { wrap } = wrapper({ status: READY, start: { ...START, skills_error: 'agent exited', agent_problem: problem }, agentPrograms: listing() });
        await render(<NewChatScreen onOpen={() => undefined} onChooseDocuments={() => undefined} />, { wrapper: wrap });
        expect(await screen.findByText(title)).toBeTruthy();
        expect(screen.queryByText(t('newChat.assistantUnavailable'))).toBeNull();
    });

    it('scrolls the screen to the end when the card appears', async () => {
        const { wrap } = wrapper({ status: READY, start: { ...START, skills_error: 'agent exited', agent_problem: MISSING }, agentPrograms: listing() });
        const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
        jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0);
            return 0;
        });
        await render(<NewChatScreen onOpen={() => undefined} onChooseDocuments={() => undefined} />, { wrapper: wrap });
        fireEvent(await screen.findByTestId('agent-recovery-slot'), 'layout', { nativeEvent: { layout: { x: 0, y: 900, width: 390, height: 300 } } });
        expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
        jest.restoreAllMocks();
    });

    it('Send keeps the text in the box, sends nothing and says so', async () => {
        const { client, wrap } = wrapper({ status: READY, start: { ...START, skills_error: 'agent exited', agent_problem: MISSING }, agentPrograms: listing() });
        await render(<NewChatScreen onOpen={() => undefined} onChooseDocuments={() => undefined} initialText="Plan my week" />, { wrapper: wrap });
        await screen.findByTestId('agent-recovery');
        await fireEvent.press(screen.getByTestId('composer-send'));
        expect(await screen.findByText(t('newChat.agent.kept'))).toBeTruthy();
        expect(screen.getByDisplayValue('Plan my week')).toBeTruthy();
        expect(client.created).toEqual([]);
        expect(client.sent).toEqual([]);
    });
});

describeNative('AgentRecovery', () => {
    afterEach(() => useConnectionStore.setState({ connection: null }));

    const mount = async (data: FakeClientData, onRetry = jest.fn()) => {
        const { client, wrap } = wrapper(data);
        await render(<AgentRecovery problem={MISSING} answeredAt={1} onRetry={onRetry} />, { wrapper: wrap });
        return client;
    };

    it('Use the Python agent with no Python agent on the PC saves nothing and says gaiacpp stays', async () => {
        const client = await mount({ agentPrograms: listing({ installed: false }) });
        await fireEvent.press(await screen.findByTestId('agent-recovery-use-python'));
        expect(await screen.findByText(/stays your agent/)).toBeTruthy();
        expect(client.flagshipAgentSets).toEqual([]);
    });

    it('Use the Python agent saves it and asks for the start screen again', async () => {
        const onRetry = jest.fn();
        const client = await mount({ agentPrograms: listing() }, onRetry);
        await fireEvent.press(await screen.findByTestId('agent-recovery-use-python'));
        await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
        expect(client.flagshipAgentSets).toEqual(['gaiapy']);
        expect(screen.getByText(t('newChat.agent.starting'))).toBeTruthy();
    });

    it('a gaiacpp this release cannot download says why and offers no Download', async () => {
        await mount({ agentPrograms: listing({}, { can_download: false, unavailable_code: 'no_release', unavailable_reason: 'No release.' }) });
        expect(await screen.findByText(/can't be downloaded here: this GAIA release has no gaiacpp/)).toBeTruthy();
        expect(screen.queryByTestId('agent-recovery-download')).toBeNull();
        expect(screen.getByTestId('agent-recovery-use-python')).toBeTruthy();
    });

    it('a reason the PC sends without a code gets our sentence, with its text underneath', async () => {
        await mount({ agentPrograms: listing({}, { can_download: false, unavailable_code: null, unavailable_reason: 'Not built for this platform.' }) });
        expect(await screen.findByText(/can't be downloaded here\.$/)).toBeTruthy();
        expect(screen.getByText('Not built for this platform.')).toBeTruthy();
    });

    it('on a paired phone the PC refuses, says it is done on the PC and offers only Check again', async () => {
        useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', pinned: true } });
        const onRetry = jest.fn();
        const client = await mount({ agentPrograms: listing() }, onRetry);
        const reads = jest.spyOn(client, 'getAgentPrograms');
        expect(await screen.findByTestId('agent-recovery-pc-only')).toBeTruthy();
        expect(screen.queryByTestId('agent-recovery-download')).toBeNull();
        expect(screen.queryByTestId('agent-recovery-use-python')).toBeNull();
        await fireEvent.press(screen.getByTestId('agent-recovery-check-again'));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(reads).not.toHaveBeenCalled();
    });
});
