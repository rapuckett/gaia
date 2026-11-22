// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { StartScreen, SystemStatus } from '@webui/types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useNextChatFolder } from '@/features/composer';
import { UIProvider } from '@/ui';

import { NewChatScenes, type NewChatScene } from './NewChatScenes';
import { NewChatScreen } from './NewChatScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/composer',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = (state: NewChatScene) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <NewChatScenes state={state} />
        </SafeAreaProvider>,
    );

describeNative('/dev/composer new-chat scenes', () => {
    it('create-failed keeps the draft and shows the failure notice after Send', async () => {
        await mount('create-failed');
        await fireEvent.press(await screen.findByTestId('composer-send'));
        expect((await screen.findAllByText(/reach GAIA on your PC/)).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('Draft a status update for the team')).toBeTruthy();
    });

    it('create-failed mounts exactly one composer with one composer-send', async () => {
        await mount('create-failed');
        await screen.findByTestId('composer-send');
        expect(screen.getAllByTestId('composer-send', { includeHiddenElements: true })).toHaveLength(1);
        expect(screen.getAllByTestId('composer-input', { includeHiddenElements: true })).toHaveLength(1);
    });

    it('skill-prompt lands the Try it prompt under the unsent draft', async () => {
        await mount('skill-prompt');
        await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('Compare these two quotes\n\nLoad the summarize skill, then tell me briefly what it lets you do.'));
    });

    it('new-chat-setup-failed shows the PC error as the notice detail, apart from the remedy', async () => {
        await mount('new-chat-setup-failed');
        const error = await screen.findByText('The model download stopped at 41%.');
        expect(StyleSheet.flatten(error.props.style).writingDirection).toBe('ltr');
        expect(screen.queryByText(/stopped at 41%\.\s*\n/)).toBeNull();
        expect(screen.getByText(/Use a cloud model, or pick a smaller one/)).toBeTruthy();
    });

    it('new-chat-folder-refused words the withheld folder itself and keeps the PC\'s reason on the detail line', async () => {
        await mount('new-chat-folder-refused');
        expect(await screen.findByText(/^.?GAIA can't use this folder from a phone because it holds passwords or keys\. Pick another folder\..?$/)).toBeTruthy();
        const detail = screen.getByText("GAIA doesn't give a paired device this folder: it holds credentials or keys.");
        expect(StyleSheet.flatten(detail.props.style).writingDirection).toBe('ltr');
        expect(screen.queryByText(/GAIA answered with an error/)).toBeNull();
        expect(screen.getByTestId('folder-picked')).toBeTruthy();
        expect(screen.getByDisplayValue('Review the site copy for typos')).toBeTruthy();
    });

    it('new-chat-folder-outside-home words a folder outside the home folder itself', async () => {
        await mount('new-chat-folder-outside-home');
        expect(await screen.findByText(/^.?GAIA can only use folders inside your home folder on the PC from a phone\. Pick a folder there\..?$/)).toBeTruthy();
        expect(screen.getByText(/browses only your home folder on the PC/)).toBeTruthy();
    });
});

describeNative('a new chat given a folder', () => {
    const SITE = '/Users/Shared/Projects/site';
    const listing = (path: string, entries: { name: string; type: 'folder' | 'file' }[]) => ({
        current_path: path,
        parent_path: null,
        quick_links: [],
        entries: entries.map((e) => ({ ...e, path: `${path}/${e.name}` })),
    });
    const ready = { lemonade_running: true, context_size_sufficient: true, init_state: 'ready', model_loaded: 'Gemma-4-E4B-it-GGUF' } as unknown as SystemStatus;
    const start: StartScreen = { cards: [], working_folder: { path: '/Users/Shared/GAIA/documents', name: 'documents', gaia_folder: true, choosable: true } };

    afterEach(() => useNextChatFolder.getState().set(null));

    it('picks a folder in the picker, which lists folders only, and gives it to the chat as it is made', async () => {
        const client = createFakeClient({
            status: ready,
            start,
            fileFolders: {
                '': listing('/Users/Shared/Projects', [{ name: 'site', type: 'folder' }, { name: 'budget.xlsx', type: 'file' }]),
                [SITE]: listing(SITE, []),
            },
        });
        await render(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                    <GaiaClientProvider client={client}>
                        <UIProvider>
                            <NewChatScreen onOpen={() => undefined} onChooseDocuments={() => undefined} initialText="Fix the footer" />
                        </UIProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            </SafeAreaProvider>,
        );
        await fireEvent.press(await screen.findByTestId('folder-add'));
        await fireEvent.press(await screen.findByText(/^\W*site\W*$/));
        expect(screen.queryByText(/budget/)).toBeNull();
        await waitFor(() => expect(screen.getByDisplayValue(SITE)).toBeTruthy());
        await fireEvent.press(screen.getByTestId('folder-picker-use'));
        expect(await screen.findByTestId('folder-picked')).toBeTruthy();
        expect(client.created).toEqual([]);

        await fireEvent.press(screen.getByTestId('composer-send'));
        await waitFor(() => expect(client.created).toHaveLength(1));
        expect(client.created[0]).toMatchObject({ folders: [SITE] });
        await waitFor(() => expect(useNextChatFolder.getState().path).toBeNull());
    });
});
