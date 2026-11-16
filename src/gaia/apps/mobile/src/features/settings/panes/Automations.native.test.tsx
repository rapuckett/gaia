// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Automation } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import Automations from './Automations';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const t = translator('en');
const item = (id: string, name: string): Automation => ({
    id, name, kind: 'summary', heartbeat: false, paused: false, every_seconds: 86400, next_at: 1794906000, last_run_at: 0, runs: 0,
    prompt: 'Summarize my inbox', say: '', check: '', quiet: '', days: '', failures: 0,
});

afterEach(() => act(() => sheetStore.reset()));

// Sheets are native-only: the web jest project can't mount them.
(Platform.OS === 'web' ? describe.skip : describe)('Settings > Automations', () => {
    it('pauses and resumes by id, and removes only after the sheet confirms', async () => {
        const client = createFakeClient({ automations: { automations: [item('a1', 'Inbox digest'), item('b2', 'Keep me')], delivers: true } });
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <SheetHost>
                            <Automations />
                        </SheetHost>
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await fireEvent.press(await screen.findByTestId('automation-toggle-a1'));
        await waitFor(() => expect(screen.getAllByText(t('settings.automations.resume')).length).toBe(1));
        await fireEvent.press(screen.getByTestId('automation-toggle-a1'));
        await waitFor(() => expect(screen.queryAllByText(t('settings.automations.resume')).length).toBe(0));

        await fireEvent.press(screen.getByTestId('automation-remove-a1'));
        expect(await screen.findByText(/Remove .*Inbox digest.*\?/)).toBeTruthy();
        expect(client.automationActions.map((a) => a.action)).toEqual(['pause', 'resume']);
        await fireEvent.press(screen.getByTestId('confirm-ok'));
        await waitFor(() => expect(screen.queryByTestId('automation-a1')).toBeNull());
        expect(client.automationActions).toEqual([
            { action: 'pause', ref: 'a1' },
            { action: 'resume', ref: 'a1' },
            { action: 'delete', ref: 'a1' },
        ]);
        expect(screen.getByTestId('automation-b2')).toBeTruthy();
    });
});
