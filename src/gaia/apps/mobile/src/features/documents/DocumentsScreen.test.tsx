// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { stripIsolates } from '@webui/i18n/registry';
import { REMOVE_UNDO_MS } from '@webui/utils/documentLibrary.core';

import type { DocumentListResponse } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { DocumentsScreen } from './DocumentsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));

const doc = (id: string, filename: string, status: string, size: number) => ({
    id,
    filename,
    filepath: `/docs/${filename}`,
    file_size: size,
    chunk_count: 3,
    indexed_at: new Date().toISOString(),
    indexing_status: status,
});

async function mount(client: ReturnType<typeof createFakeClient>) {
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
    await render(<DocumentsScreen />, { wrapper: wrap });
}

describe('DocumentsScreen', () => {
    it('lists documents with a count and total size, and no chooser without a chat', async () => {
        const documents = [doc('a', 'notes.txt', 'complete', 2048), doc('b', 'bad.pdf', 'failed', 1024)];
        await mount(createFakeClient({ documents: { documents, total: 2, total_chunks: 6, total_size_bytes: 3072 } as DocumentListResponse }));
        expect(await screen.findByText(/notes\.txt/)).toBeTruthy();
        expect(screen.getByText(stripIsolates('1 document'))).toBeTruthy();
        expect(screen.getByText(/couldn't be read/)).toBeTruthy();
        expect(screen.getByText(/3 KB/)).toBeTruthy();
        expect(screen.getByText(/attached to your next new chat/)).toBeTruthy();
    });

    it('says so when the library is empty', async () => {
        await mount(createFakeClient());
        expect(await screen.findByText('No documents yet')).toBeTruthy();
    });

    it('shows a load failure with Try again, which reads the library again', async () => {
        const client = createFakeClient();
        const listDocuments = jest.fn().mockRejectedValueOnce(new Error('backend is starting')).mockResolvedValue({ documents: [], total: 0, total_chunks: 0, total_size_bytes: 0 });
        client.listDocuments = listDocuments;
        await mount(client);
        expect(await screen.findByText(/Couldn't load your documents: backend is starting/)).toBeTruthy();
        fireEvent.press(screen.getByText('Try again'));
        expect(await screen.findByText('No documents yet')).toBeTruthy();
        expect(listDocuments).toHaveBeenCalledTimes(2);
    });

    describe('remove with Undo', () => {
        const library = () => ({ documents: [doc('a', 'notes.txt', 'complete', 2048)], total: 1, total_chunks: 3, total_size_bytes: 2048 }) as DocumentListResponse;
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('Undo puts the row back and the document is never deleted', async () => {
            const client = createFakeClient({ documents: library() });
            await mount(client);
            fireEvent.press(await screen.findByLabelText('Remove notes.txt'));
            expect(screen.queryByLabelText('Remove notes.txt')).toBeNull();
            fireEvent.press(screen.getByText('Undo'));
            await act(() => jest.advanceTimersByTimeAsync(REMOVE_UNDO_MS * 2));
            expect(screen.getByLabelText('Remove notes.txt')).toBeTruthy();
            expect(client.documentActions).toEqual([]);
        });

        it('without Undo the DELETE goes out once the window ends, not before', async () => {
            const client = createFakeClient({ documents: library() });
            await mount(client);
            fireEvent.press(await screen.findByLabelText('Remove notes.txt'));
            await act(() => jest.advanceTimersByTimeAsync(REMOVE_UNDO_MS - 1));
            expect(client.documentActions).toEqual([]);
            await act(() => jest.advanceTimersByTimeAsync(1));
            expect(client.documentActions).toEqual([{ action: 'delete', docId: 'a' }]);
        });

        it('a failed DELETE brings the row back with the reason', async () => {
            const client = createFakeClient({ documents: library(), documentFailures: { delete: 'disk is read-only' } });
            await mount(client);
            fireEvent.press(await screen.findByLabelText('Remove notes.txt'));
            await act(() => jest.advanceTimersByTimeAsync(REMOVE_UNDO_MS));
            expect(await screen.findByText(/Couldn't remove notes\.txt: disk is read-only/)).toBeTruthy();
            expect(screen.getByLabelText('Remove notes.txt')).toBeTruthy();
        });
    });
});
