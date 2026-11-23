// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DocumentListResponse } from '@/api/client.types';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';

import { DocumentRow } from './DocumentRow';

type Doc = DocumentListResponse['documents'][number];

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const doc = (fields: Partial<Doc>) =>
    ({ id: 'd', filename: 'notes.pdf', filepath: '/docs/notes.pdf', file_size: 2048, chunk_count: 3, indexed_at: null, indexing_status: 'complete', ...fields }) as unknown as Doc;

const mount = (document: Doc, extra: Partial<Parameters<typeof DocumentRow>[0]> = {}) =>
    render(
        <DocumentRow document={document} now={Date.now()} retrying={false} onPreview={jest.fn()} onCancel={jest.fn()} onRetry={jest.fn()} onRemove={jest.fn()} {...extra} />,
        { wrapper: wrap },
    );

describeNative('DocumentRow accessibility', () => {
    it('names every action after its file, with a role and a 44 pt target', async () => {
        await mount(doc({}), { attach: { chatName: null, onAttach: jest.fn() } });
        const list = touchables();
        expect(list.length).toBeGreaterThanOrEqual(3);
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        for (const t of list) expect(t.name).toContain('notes.pdf');
    });

    it('the row label reaches a screen reader without swallowing the action buttons', async () => {
        await mount(doc({ indexed_at: '2026-11-14T10:00:00Z' }));
        const row = walk().find((n) => n.props.accessible === true && /notes\.pdf, /.test(String(n.props.accessibilityLabel)));
        expect(row).toBeTruthy();
        expect(JSON.stringify(row)).not.toContain('Remove notes.pdf');
        expect(touchables().some((t) => /^Remove/.test(t.name))).toBe(true);
    });

    it('a failed document names its Retry and says why, in that order', async () => {
        await mount(doc({ indexing_status: 'failed', last_error: 'RAG indexing failed for notes.pdf: the file is damaged' }));
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        expect(list.some((t) => /notes\.pdf/.test(t.name) && t.role === 'button')).toBe(true);
        const names = walk().map((n) => n.props.accessibilityLabel);
        expect(names.some((n) => typeof n === 'string' && /notes\.pdf/.test(n))).toBe(true);
    });

    it('a busy Retry says it is disabled', async () => {
        await mount(doc({ indexing_status: 'failed', last_error: 'x: y' }), { retrying: true });
        expect(touchables().find((t) => /Retry|retry/.test(t.name))?.disabled).toBe(true);
    });

    it('an indexing document has a named, valued progress bar and a Cancel', async () => {
        await mount(doc({ indexing_status: 'indexing' }), { progress: { phase: 'embedding', done: 38, total: 100 } });
        const bar = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(bar).toBeTruthy();
        expect(String(bar!.props.accessibilityLabel)).not.toBe('');
        expect(bar!.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 38 });
        expect(unnamed(touchables())).toEqual([]);
    });

    it('the failure details toggle exposes expanded and flips it', async () => {
        await mount(doc({ indexing_status: 'failed', last_error: 'RAG indexing failed for notes.pdf: line one\nline two' }));
        const toggle = touchables().find((t) => t.expanded !== undefined);
        expect(toggle).toBeTruthy();
        expect(toggle!.expanded).toBe(false);
        await fireEvent.press(screen.getByText(toggle!.name));
        expect(touchables().find((t) => t.name === toggle!.name)?.expanded).toBe(true);
    });
});
