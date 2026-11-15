// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DocumentListResponse } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaApiError } from '@/api/errors';
import { GaiaClientProvider } from '@/data';
import { pickDocuments } from '@/platform/pickers';
import { ThemeProvider } from '@/ui';

import { DocumentsScreen } from './DocumentsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('@/platform/pickers', () => ({ pickDocuments: jest.fn(), pickPhotos: jest.fn() }));

const doc = (id: string, filename: string, status: string, size: number) => ({
    id,
    filename,
    filepath: `/docs/${filename}`,
    file_size: size,
    chunk_count: 3,
    indexed_at: new Date().toISOString(),
    indexing_status: status,
});

async function mount(client: ReturnType<typeof createFakeClient>, chatId?: string) {
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
    await render(<DocumentsScreen chatId={chatId} />, { wrapper: wrap });
}

describe('DocumentsScreen', () => {
    it('lists documents with a count and total size, and no chooser without a chat', async () => {
        const documents = [doc('a', 'notes.txt', 'complete', 2048), doc('b', 'bad.pdf', 'failed', 1024)];
        await mount(createFakeClient({ documents: { documents, total: 2, total_chunks: 6, total_size_bytes: 3072 } as DocumentListResponse }));
        expect(await screen.findByText(/notes\.txt/)).toBeTruthy();
        expect(screen.getByText(/^\u2066?1\u2069? document$/)).toBeTruthy();
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

    describe('adding a file from the phone', () => {
        const file = (name: string) => ({ uri: `file:///cache/${name}`, name, mimeType: null, size: 10 });
        const chat = { id: 'c1', title: 'A chat', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', model: '', system_prompt: null, message_count: 1, document_ids: [] };

        it('uploads it and attaches it to the chat the library was opened from', async () => {
            (pickDocuments as jest.Mock).mockResolvedValue([file('notes.txt')]);
            const client = createFakeClient({ sessions: [chat] });
            await mount(client, 'c1');
            fireEvent.press(await screen.findByText('Add a file'));
            expect(await screen.findByText(/Attached notes\.txt to/)).toBeTruthy();
            expect(client.uploaded.map((f) => f.name)).toEqual(['notes.txt']);
            expect(client.attached).toEqual([{ sessionId: 'c1', docId: 'doc-1' }]);
            expect(await screen.findByText(/notes\.txt/)).toBeTruthy();
        });

        it('shows the category help when GAIA refuses the file', async () => {
            (pickDocuments as jest.Mock).mockResolvedValue([file('big.pdf')]);
            const uploadError = new GaiaApiError(400, 'too big', undefined, undefined, { status: 'too_large', max_mb: 20 });
            await mount(createFakeClient({ uploadError }));
            fireEvent.press(await screen.findByText('Add a file'));
            expect(await screen.findByText('"big.pdf" is too large')).toBeTruthy();
            expect(screen.getByText(/up to 20 MB/)).toBeTruthy();
        });

        it('rules out an unsupported type before sending it', async () => {
            (pickDocuments as jest.Mock).mockResolvedValue([file('clip.mp4')]);
            const client = createFakeClient();
            await mount(client);
            fireEvent.press(await screen.findByText('Add a file'));
            expect(await screen.findByText('Video files not supported')).toBeTruthy();
            expect(client.uploaded).toEqual([]);
        });
    });
});
