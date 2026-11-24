// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Session } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ltr, translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { DeleteChats } from './DeleteChats';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const chat = (id: string): Session => ({ id, title: `Chat ${id}`, created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z' }) as Session;

afterEach(() => act(() => sheetStore.reset()));

// Sheets are native-only: the web jest project can't mount them.
(Platform.OS === 'web' ? describe.skip : describe)('Delete all chats', () => {
    it('asks first, then deletes each chat once and reports the one that failed', async () => {
        const client = createFakeClient({ sessions: [chat('a'), chat('b'), chat('c')], deleteSessionErrors: { b: new Error('locked') } });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <SheetHost>
                            <DeleteChats />
                        </SheetHost>
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await screen.findByText(t('settings.privacy.deleteWarning'));
        await fireEvent.press(screen.getByTestId('privacy-delete-all'));
        expect(await screen.findByText(t.plural('mobileApp.settings.privacy.deleteAsk', 3))).toBeTruthy();
        expect(client.deletedSessions).toEqual([]);

        await fireEvent.press(screen.getByTestId('privacy-delete-confirm'));
        await screen.findByText(t('mobileApp.plain.settings.privacy.deleteFailed', { n: 1 }));
        expect(screen.getByText(`Chat b: ${ltr('locked')}`)).toBeTruthy();
        expect(client.deletedSessions).toEqual(['a', 'c']);
    });

    it('lists at most five failed chats on the detail line, then how many more', async () => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const client = createFakeClient({
            sessions: ids.map(chat),
            deleteSessionErrors: Object.fromEntries(ids.map((id) => [id, new Error(`locked ${id}`)])),
        });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <SheetHost>
                            <DeleteChats />
                        </SheetHost>
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await screen.findByText(t('settings.privacy.deleteWarning'));
        await fireEvent.press(screen.getByTestId('privacy-delete-all'));
        await fireEvent.press(await screen.findByTestId('privacy-delete-confirm'));
        await screen.findByText(t('mobileApp.plain.settings.privacy.deleteFailed', { n: 6 }));
        const lines = ids.slice(0, 5).map((id) => `Chat ${id}: ${ltr(`locked ${id}`)}`);
        expect(screen.getByText([...lines, t('newChat.docs.hidden', { n: 1 })].join('\n'))).toBeTruthy();
    });
});
