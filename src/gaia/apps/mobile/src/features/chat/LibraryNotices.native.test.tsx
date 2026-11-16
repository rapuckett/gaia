// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Message } from '@/api/client.types';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { libraryNoticesFromEvents } from './LibraryNotices';
import { AssistantBubble } from './messages/AssistantBubble';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const NOTICE = "run.exe couldn't be added to your documents (.exe files are not supported).";
const reply = (extra: object = {}): Message =>
    ({ id: 2, session_id: 's', role: 'assistant', content: 'Done.', created_at: '2026-11-13T14:05:09Z', rag_sources: null, ...extra }) as Message;

const show = (message: Message) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <ThemeProvider>
                <SheetHost>
                    <AssistantBubble message={message} />
                </SheetHost>
            </ThemeProvider>
        </QueryClientProvider>,
    );

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('library notices on a reply', () => {
    it('shows every notice the saved reply carries, so a reopened chat has them', async () => {
        await show(reply({ library_notices: [NOTICE, 'b.md has the same content as a.md'] }));
        expect(screen.getByText(NOTICE)).toBeTruthy();
        expect(screen.getByText('b.md has the same content as a.md')).toBeTruthy();
    });

    it('shows nothing extra without them', async () => {
        await show(reply());
        expect(screen.queryByTestId('library-notices')).toBeNull();
    });
});

describe('notices from a finished turn', () => {
    it('reads them off the done event and ignores a turn without any', () => {
        const done = { type: 'done', message_id: 2, content: 'Done.' } as const;
        expect(libraryNoticesFromEvents([done, { ...done, library_notices: [NOTICE] }])).toEqual([NOTICE]);
        expect(libraryNoticesFromEvents([done])).toEqual([]);
    });
});
