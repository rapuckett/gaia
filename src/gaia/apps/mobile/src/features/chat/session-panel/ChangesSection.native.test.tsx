// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { SessionChanges } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { ChangesSection } from './ChangesSection';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const changes: SessionChanges = {
    files: [
        {
            path: '/work/a.txt',
            change: 'edited',
            unified: '',
            binary: false,
            too_large: false,
            truncated: false,
            additions: 2,
            deletions: 1,
            before_size: 1,
            after_size: 2,
            message_ids: [7],
            changed_since: null,
        },
    ],
    totals: { files: 1, additions: 2, deletions: 1, uncounted: 0 },
    turns: 1,
    pending: false,
    untracked: [],
    incomplete: false,
};

// Undo all is destructive: a file changed since is overwritten only after "Undo anyway".
(Platform.OS === 'web' ? describe.skip : describe)('Undo all', () => {
    it('posts force only after Undo anyway, then empties the list', async () => {
        const conflict = new GaiaApiError(409, 'a.txt changed after this chat', undefined, undefined, { status: 'conflict' });
        const client = createFakeClient({ sessionChanges: { s1: changes }, undoConflict: conflict });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <ChangesSection sessionId="s1" live={false} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await fireEvent.press(await screen.findByTestId('changes-undo-all'));
        await fireEvent.press(screen.getByTestId('changes-undo-confirm'));
        await screen.findByText('a.txt changed after this chat');
        expect(client.undone).toEqual([{ sessionId: 's1', turnId: '*', force: false }]);

        await fireEvent.press(screen.getByTestId('changes-undo-force'));
        await screen.findByText(t('mobileApp.changes.done', { parts: t.plural('mobileApp.changes.done.restored', 1) }));
        expect(client.undone.map((u) => u.force)).toEqual([false, true]);
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Undo all conflict', () => {
    it('keeps the PC reason out of the sentence, on its own left-to-right line', async () => {
        const reason = 'a.txt changed after this chat';
        const client = createFakeClient({ sessionChanges: { s1: changes }, undoConflict: new GaiaApiError(409, reason, undefined, undefined, { status: 'conflict' }) });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <ChangesSection sessionId="s1" live={false} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await fireEvent.press(await screen.findByTestId('changes-undo-all'));
        await fireEvent.press(screen.getByTestId('changes-undo-confirm'));
        const sentence = await screen.findByText(t('mobileApp.changes.undoConflict'));
        expect(sentence.props.children).not.toContain(reason);
        const detail = (await screen.findByText(reason)) as unknown as { props: { style: { writingDirection?: string } } };
        expect(detail.props.style.writingDirection).toBe('ltr');
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Undo all failure', () => {
    it('keeps the PC reason out of the sentence, on its own line', async () => {
        const reason = 'disk is read-only';
        const client = createFakeClient({ sessionChanges: { s1: changes }, undoConflict: new GaiaApiError(500, reason) });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <ChangesSection sessionId="s1" live={false} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await fireEvent.press(await screen.findByTestId('changes-undo-all'));
        await fireEvent.press(screen.getByTestId('changes-undo-confirm'));
        const sentence = await screen.findByText(t('mobileApp.chg.undoFailedShort'));
        expect(sentence.props.children).not.toContain(reason);
        expect(await screen.findByText(reason)).toBeTruthy();
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Undo all confirm accessibility', () => {
    it('reads the sentence as a header, then reaches Undo all and Cancel on their own', async () => {
        const client = createFakeClient({ sessionChanges: { s1: changes } });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <ChangesSection sessionId="s1" live={false} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        await fireEvent.press(await screen.findByTestId('changes-undo-all'));

        const prompt = screen.getByRole('header');
        expect(prompt.props.accessibilityRole).toBe('header');
        for (const id of ['changes-undo-confirm', 'changes-undo-cancel']) {
            type Node = { parent: Node | null; props: { accessible?: boolean } };
            for (let node = (screen.getByTestId(id) as unknown as Node).parent; node; node = node.parent) {
                expect(node.props.accessible).not.toBe(true);
            }
        }
        expect(screen.getByRole('button', { name: t('chg.undoAll') })).toBeTruthy();
        expect(screen.getByRole('button', { name: t('mobileApp.changes.cancel') })).toBeTruthy();
    });
});
