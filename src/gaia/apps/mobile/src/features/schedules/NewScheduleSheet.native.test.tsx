// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { NewScheduleSheet } from './NewScheduleSheet';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const RealDateTimeFormat = Intl.DateTimeFormat;

afterEach(() => {
    jest.restoreAllMocks();
    return act(() => sheetStore.reset());
});

// Sheets are native-only: the web jest project can't mount them.
(Platform.OS === 'web' ? describe.skip : describe)('the new schedule sheet', () => {
    it('sends the device time zone when it reads the schedule and when it creates it', async () => {
        jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...args: unknown[]) =>
            args.length === 0
                ? { resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }) }
                : new (RealDateTimeFormat as unknown as new (...a: unknown[]) => object)(...args)) as unknown as typeof Intl.DateTimeFormat);
        const client = createFakeClient();
        const parse = jest.spyOn(client, 'parseSchedule');
        const create = jest.spyOn(client, 'createSchedule');
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <SheetHost>
                            <NewScheduleSheet open onClose={() => {}} />
                        </SheetHost>
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );

        await fireEvent.changeText(await screen.findByPlaceholderText(t.bare('schedules.whenPlaceholder')), 'every day at 9am');
        await waitFor(() => expect(parse).toHaveBeenCalled());
        expect(parse.mock.calls[0]![0]).toBe('every day at 9am');
        expect(parse.mock.calls[0]![1]).toBe('Asia/Tokyo');

        await fireEvent.changeText(screen.getByPlaceholderText(t.bare('schedules.namePlaceholder')), 'morning');
        await fireEvent.changeText(screen.getByPlaceholderText(t.bare('schedules.promptPlaceholder')), 'Summarize my inbox');
        await waitFor(() => expect(screen.getByText(t('schedules.create'))).toBeEnabled());
        await fireEvent.press(screen.getByText(t('schedules.create')));
        await waitFor(() => expect(create).toHaveBeenCalled());
        expect(create.mock.calls[0]![0]).toEqual({
            name: 'morning',
            interval: 'every day at 9am',
            prompt: 'Summarize my inbox',
            timezone: 'Asia/Tokyo',
        });
    });
});
