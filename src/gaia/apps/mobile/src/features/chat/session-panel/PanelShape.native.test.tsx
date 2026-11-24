// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Message, Session, SessionEnvironment, SystemStatus } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { SheetScrollContext, ThemeProvider } from '@/ui';

import { useSessionPanelStore } from './panelStore';
import { PanelBody } from './SessionPanel';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const ID = 'c0ffee00-1111-4222-8333-444455556666';
const SESSION = { id: ID, title: 'Trip', created_at: '2026-11-24T09:12:00Z', updated_at: '2026-11-24T09:12:00Z', agent_type: 'gaia' } as Session;
const STATUS = { version: '0.26.0', lemonade_version: '10.8.1' } as unknown as SystemStatus;

const msgs = (steps?: unknown[]): Message[] => [
    { id: 1, session_id: ID, role: 'user', content: 'hi', created_at: '2026-11-24T09:12:00Z', rag_sources: null } as Message,
    { id: 2, session_id: ID, role: 'assistant', content: 'hello', created_at: '2026-11-24T09:13:00Z', rag_sources: null, ...(steps ? { agentSteps: steps } : {}) } as Message,
];

const shell = (id: number, command: string) => ({ id, type: 'tool', label: 'Using tool', tool: 'run_shell_command', detail: `command: ${command}`, active: false, success: true, result: 'ok', timestamp: id });
const FILE_ENV: SessionEnvironment = {
    session_id: ID,
    folders: [{ path: '/Users/me/notes/permit.pdf', name: 'permit.pdf', kind: 'file', source: 'document', removable: true }],
    removed: [],
    internet: true,
    enforced: true,
    internet_enforced: true,
};

const scrollTo = jest.fn();

function mount(data: Parameters<typeof createFakeClient>[0]) {
    const client = createFakeClient({ sessions: [SESSION], status: STATUS, ...data });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetScrollContext.Provider value={{ scrollTo }}>{children}</SheetScrollContext.Provider>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
    }
    return render(<PanelBody sessionId={ID} close={() => undefined} />, { wrapper: Wrapper });
}

const chips = () => screen.queryAllByTestId(/^focus-chip-[a-z]+$/).map((c) => c.props.testID);

describeNative('the session panel is shaped to the chat', () => {
    it('shows a plain chat as Chat, with no work sections', async () => {
        await mount({ messages: { [ID]: msgs() }, environments: { [ID]: { ...FILE_ENV, folders: [] } } });
        await screen.findByTestId('panel-section-session');
        expect(chips()).toEqual(['focus-chip-chat']);
        for (const id of ['plan', 'schedule', 'commands', 'documents']) expect(screen.queryByTestId(`panel-section-${id}`)).toBeNull();
    });

    it('shows a coding chat with Coding and Commands', async () => {
        await mount({ messages: { [ID]: msgs([shell(1, 'git status --short'), shell(2, 'ls')]) }, environments: { [ID]: { ...FILE_ENV, folders: [] } } });
        await screen.findByTestId('panel-section-commands');
        expect(chips()).toEqual(['focus-chip-coding', 'focus-chip-commands']);
        expect(screen.getByText('git status --short')).toBeTruthy();
        expect(screen.queryByTestId('panel-section-documents')).toBeNull();
    });

    it('shows a documents chat with Documents and the passage count', async () => {
        await mount({
            messages: { [ID]: msgs() },
            environments: { [ID]: FILE_ENV },
            documents: {
                documents: [{ id: 'd1', filename: 'permit.pdf', filepath: '/Users/me/notes/permit.pdf', file_size: 1, chunk_count: 42, indexed_at: '', last_accessed_at: null, sessions_using: 1, indexing_status: 'complete' }],
                total: 1,
                total_chunks: 42,
                total_size_bytes: 1,
            },
        });
        await screen.findByTestId('panel-section-documents');
        expect(chips()).toEqual(['focus-chip-documents']);
        expect(await screen.findByText('42 passages')).toBeTruthy();
        expect(screen.queryByTestId('panel-section-commands')).toBeNull();
    });
});

describeNative('a chip tap', () => {
    beforeEach(() => scrollTo.mockClear());

    it('opens its section and asks the sheet to scroll it into view', async () => {
        useSessionPanelStore.getState().setSection('documents', false);
        await mount({
            messages: { [ID]: msgs() },
            environments: { [ID]: FILE_ENV },
        });
        await screen.findByTestId('panel-section-documents');
        expect(screen.queryByText('permit.pdf')).toBeNull();
        fireEvent.press(await screen.findByLabelText('Documents 1'));
        await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
        expect(scrollTo.mock.calls[0]![0]).not.toBeNull();
        expect(await screen.findByText(/permit\.pdf/)).toBeTruthy();
    });
});

describeNative('the Session section', () => {
    beforeEach(() => {
        useSessionPanelStore.getState().setSection('session', false);
        jest.mocked(Clipboard.setStringAsync).mockClear();
    });

    it('lists the id, start, agent and versions', async () => {
        await mount({ messages: { [ID]: msgs() } });
        fireEvent.press(await screen.findByTestId('panel-section-session-toggle'));
        expect(await screen.findByText('Chat ID')).toBeTruthy();
        expect(screen.getByTestId('session-id').props.children).toBe(ID);
        for (const label of ['Started', 'Agent', 'GAIA version', 'Lemonade version']) expect(screen.getByText(label)).toBeTruthy();
        expect(await screen.findByText(/0\.26\.0/)).toBeTruthy();
        expect(screen.getByText(/10\.8\.1/)).toBeTruthy();
        expect(screen.getByText('gaia')).toBeTruthy();
    });

    it('middle-truncates a 36-character chat ID', async () => {
        expect(ID).toHaveLength(36);
        await mount({ messages: { [ID]: msgs() } });
        fireEvent.press(await screen.findByTestId('panel-section-session-toggle'));
        const id = await screen.findByTestId('session-id');
        expect(id.props.ellipsizeMode).toBe('middle');
        expect(id.props.numberOfLines).toBe(1);
    });

    it('copies the id', async () => {
        await mount({ messages: { [ID]: msgs() } });
        fireEvent.press(await screen.findByTestId('panel-section-session-toggle'));
        fireEvent.press(await screen.findByLabelText('Copy chat ID'));
        await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(ID));
        expect(screen.queryByTestId('session-copy-failed')).toBeNull();
    });

    it('says when the copy failed', async () => {
        jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
        await mount({ messages: { [ID]: msgs() } });
        fireEvent.press(await screen.findByTestId('panel-section-session-toggle'));
        fireEvent.press(await screen.findByLabelText('Copy chat ID'));
        expect(await screen.findByTestId('session-copy-failed')).toBeTruthy();
    });
});
