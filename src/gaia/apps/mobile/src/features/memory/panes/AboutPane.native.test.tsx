// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { physicalAlign } from '@/ui/text/direction';

import { SAMPLE_KNOWLEDGE } from '../devScenes';
import type { MemoryNotice } from '../useMemoryNotice';
import { AboutPane } from './AboutPane';

// The web project's renderer can't mount react-native-web's DOM.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

function wrapper(client: ReturnType<typeof createFakeClient>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return Wrap;
}

describeNative('AboutPane', () => {
    it('Undo after Forget saves the same memory again, with the same text and category', async () => {
        const client = createFakeClient({ memoryKnowledge: SAMPLE_KNOWLEDGE });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const notices: MemoryNotice[] = [];
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<AboutPane notify={(n) => notices.push(n)} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrap });
        await screen.findByText('Call me Sam.');

        fireEvent.press(screen.getByTestId('memory-about-more-k8'));
        fireEvent.press(await screen.findByTestId('memory-about-forget-k8'));
        await waitFor(() => expect(notices).toHaveLength(1));
        expect(client.knowledgeCalls).toEqual([{ action: 'delete', id: 'k8' }]);
        expect(screen.queryByText('Call me Sam.')).toBeNull();

        notices[0]!.action!.onPress();
        await screen.findByText('Call me Sam.');
        const restored = client.knowledgeCalls[1]!;
        expect(restored.action).toBe('add');
        expect(restored.action === 'add' && restored.body).toMatchObject({ content: 'Call me Sam.', category: 'preference' });
    });

    it('opens Edit and Forget from the "..." button, named for the memory, and Edit opens the field', async () => {
        const client = createFakeClient({ memoryKnowledge: SAMPLE_KNOWLEDGE });
        await render(<AboutPane notify={() => undefined} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrapper(client) });
        await screen.findByText('Call me Sam.');
        expect(screen.queryByTestId('memory-about-forget-k8')).toBeNull();
        expect(screen.getByLabelText('More actions for Call me Sam.')).toBeTruthy();

        fireEvent.press(screen.getByTestId('memory-about-more-k8'));
        expect(await screen.findByTestId('memory-about-forget-k8')).toBeTruthy();
        fireEvent.press(screen.getByTestId('memory-about-edit-open-k8'));
        expect(await screen.findByTestId('memory-about-edit-k8')).toBeTruthy();
        expect(client.knowledgeCalls).toEqual([]);
    });

    it('opens the same sheet on a long-press of the row, and Forget there deletes with Undo and no extra confirm', async () => {
        const client = createFakeClient({ memoryKnowledge: SAMPLE_KNOWLEDGE });
        const notices: MemoryNotice[] = [];
        await render(<AboutPane notify={(n) => notices.push(n)} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrapper(client) });
        fireEvent(await screen.findByText('Call me Sam.'), 'longPress');
        expect(await screen.findByTestId('memory-about-edit-open-k8')).toBeTruthy();
        fireEvent.press(screen.getByTestId('memory-about-forget-k8'));
        await waitFor(() => expect(notices[0]?.action).toBeTruthy());
        expect(client.knowledgeCalls).toEqual([{ action: 'delete', id: 'k8' }]);
    });

    describe('in the Arabic UI', () => {
        beforeEach(() => useLocaleStore.getState().setLocale('ar'));
        afterEach(() => useLocaleStore.getState().setLocale(null));

        it('lays memory text out in its own direction, on the UI start, and keeps the gloss date in English', async () => {
            const arabic = { ...SAMPLE_KNOWLEDGE[0]!, id: 'ar1', content: 'اتصل بي سام.' };
            const client = createFakeClient({ memoryKnowledge: [...SAMPLE_KNOWLEDGE, arabic] });
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
            const wrap = ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>
                        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                            <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                        </SafeAreaProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            );
            await render(<AboutPane notify={() => undefined} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrap });
            const body = await screen.findByText('Call me Sam.');
            expect(body.props.style).toMatchObject({ writingDirection: 'ltr', textAlign: physicalAlign(true) });
            expect((await screen.findByText('اتصل بي سام.')).props.style).toMatchObject({ writingDirection: 'rtl', textAlign: physicalAlign(true) });
            const row = screen.getByTestId('memory-about-row-k8');
            expect(within(row).getByText(/\([^)]*[A-Z][a-z]{2} \d{1,2}, \d{4}[^)]*\)/)).toBeTruthy();
        });
    });
});

describeNative('AboutPane paging', () => {
    it('says how many of the total it shows and offers Show more when the PC holds more', async () => {
        const client = createFakeClient({ memoryKnowledge: SAMPLE_KNOWLEDGE, memoryKnowledgeTotal: 230 });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<AboutPane notify={() => undefined} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrap });
        await screen.findByText('Call me Sam.');
        expect(await screen.findByText(/of 230/)).toBeTruthy();
        expect(screen.getByLabelText('Show more')).toBeTruthy();
    });
});
