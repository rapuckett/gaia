// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider, useAppearance } from '@/ui';

import { ChatHeader } from './ChatHeader';

jest.mock('@/features/nav/ScreenHeader', () => ({
    ScreenHeader: ({ titleNode, end }: { titleNode?: ReactNode; end?: ReactNode }) => (
        <>
            {titleNode}
            {end}
        </>
    ),
}));

const SESSION = {
    id: 'chat-1',
    title: 'A chat',
    created_at: '2026-11-14T00:00:00Z',
    updated_at: '2026-11-14T00:00:00Z',
    model: '',
    system_prompt: null,
    message_count: 0,
    document_ids: [],
};

async function mount(onOpenSessionPanel?: () => void, client: ReturnType<typeof createFakeClient> = createFakeClient({ sessions: [SESSION] })) {
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
    await render(<ChatHeader sessionId="chat-1" onOpenSessionPanel={onOpenSessionPanel} />, { wrapper: wrap });
    await screen.findByTestId('private-toggle');
}

describe('ChatHeader title', () => {
    it('closes an open rename and discards it when the chat changes', async () => {
        const client = createFakeClient({ sessions: [SESSION, { ...SESSION, id: 'chat-2', title: 'B chat' }] });
        const updateSession = jest.spyOn(client, 'updateSession');
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
        const view = await render(<ChatHeader sessionId="chat-1" />, { wrapper: wrap });
        await fireEvent.press(await screen.findByRole('button', { name: 'A chat' }));
        await fireEvent.changeText(screen.getByTestId('chat-title-input'), 'Renamed by mistake');

        await view.rerender(<ChatHeader sessionId="chat-2" />);

        expect(await screen.findByRole('button', { name: 'B chat' })).toBeTruthy();
        expect(screen.queryByTestId('chat-title-input')).toBeNull();
        expect(updateSession).not.toHaveBeenCalled();
    });


    it('is named by the chat title, with rename as the hint', async () => {
        await mount();
        const title = await screen.findByRole('button', { name: 'A chat' });
        expect(title).toBe(screen.getByTestId('chat-title'));
        expect(title.props.accessibilityHint).toBe('Rename');
    });
});

describe('ChatHeader resource strip', () => {
    afterEach(() => useAppearance.getState().reset());

    it('is hidden on a fresh install', async () => {
        await mount();
        expect(screen.queryByTestId('resources-close')).toBeNull();
        expect(screen.queryByTestId('resources-hidden-note')).toBeNull();
    });

    it('shows when the saved setting is on, and closing it turns the setting off with the note', async () => {
        useAppearance.getState().setShowResources(true);
        await mount();
        await fireEvent.press(await screen.findByTestId('resources-close'));
        expect(useAppearance.getState().showResources).toBe(false);
        expect(screen.queryByTestId('resources-close')).toBeNull();
        expect(screen.getByText(translator('en')('resources.hiddenNote'))).toBeTruthy();
    });

    it('brings the strip back from the note and from the header toggle', async () => {
        useAppearance.getState().setShowResources(true);
        await mount();
        await fireEvent.press(await screen.findByTestId('resources-close'));
        await fireEvent.press(screen.getByText(translator('en')('resources.show')));
        expect(useAppearance.getState().showResources).toBe(true);
        await fireEvent.press(screen.getByTestId('resources-toggle'));
        expect(useAppearance.getState().showResources).toBe(false);
    });
});

describe('ChatHeader session panel button', () => {
    it('shows only when onOpenSessionPanel is set', async () => {
        await mount();
        expect(screen.queryByTestId('session-panel-toggle')).toBeNull();
    });

    it('shows when onOpenSessionPanel is set', async () => {
        await mount(() => undefined);
        expect(screen.getByTestId('session-panel-toggle')).toBeTruthy();
    });
});

describe('ChatHeader failures keep the PC text off the sentence', () => {
    const t = translator('en');
    const PC_TEXT = 'sqlite: database is locked';
    const DOC = { id: 'd1', filename: 'report.pdf', filepath: '/r/report.pdf', indexing_status: 'complete' };
    const failing = () =>
        ({
            ...createFakeClient({
                sessions: [{ ...SESSION, document_ids: ['d1'] }],
                documents: { documents: [DOC], total: 1, total_chunks: 0, total_size_bytes: 0 },
            } as never),
            toggleSessionPrivate: () => Promise.reject(new GaiaApiError(500, PC_TEXT)),
            detachDocument: () => Promise.reject(new GaiaApiError(500, PC_TEXT)),
        }) as ReturnType<typeof createFakeClient>;

    it('shows a private-mode failure as a reason-free sentence with the PC text as a left-to-right detail', async () => {
        await mount(undefined, failing());
        fireEvent.press(screen.getByTestId('private-toggle'));
        expect(await screen.findByText(t('mobileApp.chat.privateFailedShort'))).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByText(PC_TEXT).props.style)).toMatchObject({ writingDirection: 'ltr' });
    });

    it('shows a document-removal failure as a reason-free sentence with the PC text as a left-to-right detail', async () => {
        await mount(undefined, failing());
        fireEvent.press(await screen.findByLabelText(t('docsBar.remove', { name: 'report.pdf' })));
        await waitFor(() => expect(screen.getByText(PC_TEXT)).toBeTruthy());
        expect(screen.getByText(/Couldn't remove .*report\.pdf.* from this chat\.$/)).toBeTruthy();
        expect(screen.queryByText(new RegExp(PC_TEXT + '.*chat'))).toBeNull();
        expect(StyleSheet.flatten(screen.getByText(PC_TEXT).props.style)).toMatchObject({ writingDirection: 'ltr' });
    });
});
