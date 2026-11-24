// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import type { TurnChanges as Turn } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { TurnChanges } from './TurnChanges';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const turn: Turn = {
    turn_id: 't1',
    session_id: 's1',
    message_id: 7,
    started_at: '2026-11-15T00:00:00Z',
    finished_at: '2026-11-15T00:01:00Z',
    restored_at: null,
    files: [{ path: '/work/a.txt', change: 'edited', tool: 'write_file' }],
    untracked: [],
    incomplete: false,
};

// Undo is destructive: a file changed since the turn is overwritten only after "Undo anyway".
(Platform.OS === 'web' ? describe.skip : describe)('Undo this turn', () => {
    it('posts force only after Undo anyway', async () => {
        const conflict = new GaiaApiError(409, 'a.txt changed after this turn', undefined, undefined, { status: 'conflict', message: 'a.txt changed after this turn' });
        const client = createFakeClient({ turnChanges: { s1: [turn] }, undoConflict: conflict });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <TurnChanges sessionId="s1" messageId={7} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await screen.findByText(t.plural('mobileApp.changes.summary', 1));
        await fireEvent.press(screen.getByTestId('turn-changes-undo'));
        await fireEvent.press(screen.getByTestId('turn-changes-confirm'));
        const sentence = await screen.findByText(t('mobileApp.changes.undoTurnConflict'));
        expect(sentence.props.children).not.toContain('a.txt changed after this turn');
        screen.getByText(t('chg.undoAnyway'));
        screen.getByText(t('chg.keep'));
        expect(screen.queryByText('a.txt changed after this turn')).toBeNull();
        await fireEvent.press(screen.getByTestId('turn-changes-details-toggle'));
        const detail = await screen.findByText('a.txt changed after this turn');
        expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ writingDirection: 'ltr' });
        expect(client.undone).toEqual([{ sessionId: 's1', turnId: 't1', force: false }]);

        await fireEvent.press(screen.getByTestId('turn-changes-force'));
        await screen.findByText(t('mobileApp.changes.done', { parts: t.plural('mobileApp.changes.done.restored', 1) }));
        expect(client.undone.map((u) => u.force)).toEqual([false, true]);
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Incomplete turn notice', () => {
    afterEach(() => useLocaleStore.getState().setLocale(null));

    it("keeps the PC's descriptions in the LTR detail, out of the Arabic message", async () => {
        useLocaleStore.getState().setLocale('ar');
        const incomplete: Turn = {
            ...turn,
            files: [],
            incomplete: true,
            untracked: [
                { kind: 'run_python', detail: 'save totals to totals.csv', paths: [] },
                { kind: 'run_python', detail: 'write the chart', paths: [] },
                { kind: 'run_python', detail: 'write the chart', paths: [] },
            ],
        };
        const client = createFakeClient({ turnChanges: { s1: [incomplete] } });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <TurnChanges sessionId="s1" messageId={7} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        const detail = await screen.findByText('save totals to totals.csv; write the chart \u00d72');
        expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ writingDirection: 'ltr' });
        expect(screen.queryByText(/write the chart/, { exact: false })).toBe(detail);
        expect(screen.queryByText(/No description/)).toBeNull();
    });
});
