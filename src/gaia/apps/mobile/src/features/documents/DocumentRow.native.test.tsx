// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DocumentListResponse } from '@/api/client.types';
import { Text, ThemeProvider } from '@/ui';

import { DocumentRow } from './DocumentRow';

type Doc = DocumentListResponse['documents'][number];

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const failed = (last_error: string) =>
    ({
        id: 'b',
        filename: 'bad.pdf',
        filepath: '/docs/bad.pdf',
        file_size: 1024,
        chunk_count: 0,
        indexed_at: null,
        indexing_status: 'failed',
        last_error,
    }) as unknown as Doc;

describeNative('DocumentRow failure reason', () => {
    it('renders the raw reason as a muted LTR detail', async () => {
        await render(
            <>
                <Text tone="muted" testID="muted-ref">reference</Text>
                <DocumentRow document={failed('RAG indexing failed for bad.pdf: the file is damaged')} now={Date.now()} retrying={false} onCancel={jest.fn()} onRetry={jest.fn()} onRemove={jest.fn()} />
            </>,
            { wrapper: wrap },
        );
        const reason = screen.getByText('the file is damaged') as unknown as { props: { style: { writingDirection?: string; color?: string } } };
        expect(reason.props.style.writingDirection).toBe('ltr');
        const muted = screen.getByTestId('muted-ref') as unknown as { props: { style: { color?: string } } };
        expect(reason.props.style.color).toBe(muted.props.style.color);
    });
});

describeNative('DocumentRow indexing progress', () => {
    it('keeps the percent sign inside the left-to-right number', async () => {
        const indexing = { ...failed(''), indexing_status: 'indexing', last_error: null } as unknown as Doc;
        await render(
            <DocumentRow document={indexing} progress={{ phase: 'embedding', done: 38, total: 100 }} now={Date.now()} retrying={false} onCancel={jest.fn()} onRetry={jest.fn()} onRemove={jest.fn()} />,
            { wrapper: wrap },
        );
        expect(screen.getByText(/\u206638%\u2069/)).toBeTruthy();
    });
});
