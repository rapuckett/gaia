// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, renderRouter } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import { Text } from 'react-native';

import DocumentsRoute from '@/app/(library)/documents';
import FilePreviewRoute from '@/app/(library)/file-preview';
import FilesRoute from '@/app/(library)/files';
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
jest.mock('@/features/documents', () => ({ DocumentsScreen: () => null }));
jest.mock('@/features/chat/sendToOpenChat', () => ({ sendToOpenChat: () => true }));

function Home() {
    return <Text>home</Text>;
}
// The drawer needs native reanimated; the library's own stack is what is under test.
function Root() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(library)" />
        </Stack>
    );
}

async function mountAt(url: string) {
    return renderRouter(
        {
            _layout: Root,
            index: Home,
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
});
