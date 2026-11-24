// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, renderRouter } from 'expo-router/testing-library';
import { router, Tabs } from 'expo-router';
import { Text } from 'react-native';

import DocumentsRoute from '@/app/(library)/documents';
import FilePreviewRoute from '@/app/(library)/file-preview';
import FilesRoute from '@/app/(library)/files';
import { openLibrary } from '@/features/nav/libraryEntry';
import * as LibraryLayout from '@/app/(library)/_layout';

jest.mock('@/features/files', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable, Text: T } = require('react-native');
    return {
        FileBrowserScreen: (p: { onPreview: (path: string) => void; onClose: () => void }) => (
            <>
                <T>browser</T>
                <Pressable accessibilityLabel="open" onPress={() => p.onPreview('/a/b.txt')} />
                <Pressable accessibilityLabel="close-browser" onPress={p.onClose} />
            </>
        ),
        FilePreviewScreen: (p: { onClose: () => void }) => (
            <>
                <T>preview</T>
                <Pressable accessibilityLabel="close" onPress={p.onClose} />
            </>
        ),
    };
});
jest.mock('@/features/documents', () => ({
    DocumentsScreen: (p: { chatId?: string; onBrowseFiles: (id: string) => void }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Pressable, Text: T } = require('react-native');
        return (
            <>
                <T>{p.chatId ? `documents:${p.chatId}` : 'documents:none'}</T>
                {p.chatId ? <Pressable accessibilityLabel="browse" onPress={() => p.onBrowseFiles(p.chatId as string)} /> : null}
            </>
        );
    },
}));
jest.mock('@/features/chat/sendToOpenChat', () => ({ sendToOpenChat: () => true }));

function Home() {
    return <Text>home</Text>;
}
function Chat() {
    return <Text>chat</Text>;
}
// Tabs stand in for the drawer, which needs native reanimated; tabs pop on blur after a timer, the drawer at once.
function Root() {
    return (
        <Tabs backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="(library)" />
            <Tabs.Screen name="chat/[id]" />
        </Tabs>
    );
}

async function mountAt(url: string) {
    return renderRouter(
        {
            _layout: Root,
            index: Home,
            'chat/[id]': Chat,
            '(library)/_layout': LibraryLayout,
            '(library)/documents': DocumentsRoute,
            '(library)/files': FilesRoute,
            '(library)/file-preview': FilePreviewRoute,
        },
        { initialUrl: url },
    );
}

describe('library stack', () => {
    it('Close on a preview opened from the browser returns to the browser', async () => {
        const view = await mountAt('/files?chat=c1');
        expect(view.getByText('browser')).toBeTruthy();
        await act(async () => fireEvent.press(view.getByLabelText('open')));
        expect(view.getByText('preview')).toBeTruthy();
        await act(async () => fireEvent.press(view.getByLabelText('close')));
        expect(view).toHavePathname('/files');
        expect(view.getByText('browser')).toBeTruthy();
    });

    it('Close on a cold-linked preview lands on the library, not a dead end', async () => {
        const view = await mountAt('/file-preview?chat=c1&path=%2Fa%2Fb.txt');
        expect(view.getByText('preview')).toBeTruthy();
        await act(async () => fireEvent.press(view.getByLabelText('close')));
        expect(view).toHavePathname('/documents');
    });

    it('a cold-linked preview with a chat has that chat\'s Documents beneath it', async () => {
        const view = await mountAt('/file-preview?chat=c1&path=%2Fa%2Fb.txt');
        await act(async () => fireEvent.press(view.getByLabelText('close')));
        expect(view.getByText('documents:c1')).toBeTruthy();
    });

    it('a cold-linked browser with a chat has that chat\'s Documents beneath it', async () => {
        const view = await mountAt('/files?chat=c1');
        await act(async () => fireEvent.press(view.getByLabelText('close-browser')));
        expect(view.getByText('documents:c1')).toBeTruthy();
    });

    it('a cold link with no chat keeps the chat-less Documents', async () => {
        const view = await mountAt('/file-preview');
        expect(view).toHavePathname('/documents');
        expect(view.getByText('documents:none')).toBeTruthy();
    });

    it('entering Documents from outside starts a fresh stack, with no stale preview or browser', async () => {
        const view = await mountAt('/documents?chat=c1');
        await act(async () => fireEvent.press(view.getByLabelText('browse')));
        await act(async () => fireEvent.press(view.getByLabelText('open')));
        expect(view.getByText('preview')).toBeTruthy();
        await act(async () => router.navigate('/chat/c2'));
        await act(async () => jest.runAllTimers());
        expect(view.getByText('chat')).toBeTruthy();
        await act(async () => openLibrary(router));
        expect(view.getByText('documents:none')).toBeTruthy();
        await act(async () => router.back());
        expect(view.getByText('home')).toBeTruthy();
    });

    it('Documents for a chat, then the drawer row, is one fresh Documents', async () => {
        const view = await mountAt('/documents?chat=c1');
        await act(async () => openLibrary(router));
        expect(view.getByText('documents:none')).toBeTruthy();
        await act(async () => router.back());
        expect(view.getByText('home')).toBeTruthy();
    });

    it('Manage documents from a chat opens one Documents for that chat', async () => {
        const view = await mountAt('/chat/c1');
        await act(async () => openLibrary(router, 'c1'));
        expect(view.getByText('documents:c1')).toBeTruthy();
        await act(async () => router.back());
        expect(view.getByText('home')).toBeTruthy();
    });
});
