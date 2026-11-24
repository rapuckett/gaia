// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Message } from '@/api/client.types';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { ImageThumbs } from './ImageThumbs';
import { UploadedImageLoaderContext } from './uploadedImage';
import { UserBubble } from './UserBubble';
import type { SentAttachment } from './attachedLinks';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const image = (name: string): SentAttachment => ({ name, url: `/api/files/uploads/${name}`, isImage: true });
const IMAGES = ['a.png', 'b.jpg', 'c.png'].map(image);
const loader = jest.fn((path: string) => Promise.resolve({ uri: `data:image/png;base64,${path.split('/').pop()}`, mime: 'image/png', base64: '' }));

const wrap = (node: React.ReactElement) =>
    render(
        <ThemeProvider>
            <UploadedImageLoaderContext.Provider value={loader}>{node}</UploadedImageLoaderContext.Provider>
        </ThemeProvider>,
    );

describeNative('image strip and viewer', () => {
    it('shows one thumbnail per image, labeled from the catalog', async () => {
        await wrap(<ImageThumbs images={IMAGES} />);
        expect(screen.getByLabelText(t('msg.images'))).toBeTruthy();
        expect(screen.getAllByTestId('user-image-thumb')).toHaveLength(3);
        expect(screen.getByLabelText(t('msg.imageOpen', { name: 'b.jpg' }))).toBeTruthy();
        expect(screen.queryByTestId('image-viewer')).toBeNull();
    });

    it('opens the viewer at the tapped image, steps both ways with a wrap, and closes', async () => {
        await wrap(<ImageThumbs images={IMAGES} />);
        await fireEvent.press(screen.getByLabelText(t('msg.imageOpen', { name: 'b.jpg' })));
        expect(screen.getByLabelText(t('imageViewer.dialog'))).toBeTruthy();
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/b\.jpg.*2 of 3/);

        await fireEvent.press(screen.getByLabelText(t('imageViewer.next')));
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/c\.png.*3 of 3/);
        await fireEvent.press(screen.getByLabelText(t('imageViewer.next')));
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/a\.png.*1 of 3/);
        await fireEvent.press(screen.getByLabelText(t('imageViewer.prev')));
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/c\.png.*3 of 3/);

        await fireEvent.press(screen.getByLabelText(t('imageViewer.close')));
        expect(screen.queryByTestId('image-viewer')).toBeNull();
    });

    it('steps on a swipe, and ignores a short drag', async () => {
        await wrap(<ImageThumbs images={IMAGES} />);
        await fireEvent.press(screen.getAllByTestId('user-image-thumb')[0]);
        const stage = screen.getByTestId('image-viewer-stage');
        const drag = async (from: number, to: number) => {
            await fireEvent(stage, 'touchStart', { nativeEvent: { pageX: from } });
            await fireEvent(stage, 'touchEnd', { nativeEvent: { pageX: to } });
        };
        await drag(200, 120);
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/b\.jpg.*2 of 3/);
        await drag(200, 190);
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/b\.jpg.*2 of 3/);
        await drag(120, 200);
        expect(screen.getByTestId('image-viewer-caption')).toHaveTextContent(/a\.png.*1 of 3/);
    });

    it('closes on Android back', async () => {
        await wrap(<ImageThumbs images={IMAGES} />);
        await fireEvent.press(screen.getAllByTestId('user-image-thumb')[0]);
        let node = screen.getByTestId('image-viewer').parent;
        while (node && !node.props.onRequestClose) node = node.parent;
        await act(async () => node?.props.onRequestClose());
        expect(screen.queryByTestId('image-viewer')).toBeNull();
    });

    it('a single image has no arrows and no count', async () => {
        await wrap(<ImageThumbs images={[image('only.png')]} />);
        await fireEvent.press(screen.getByTestId('user-image-thumb'));
        expect(screen.queryByLabelText(t('imageViewer.next'))).toBeNull();
        expect(screen.getByTestId('image-viewer-caption')).not.toHaveTextContent(/ of /);
    });

    it('refuses a path that is not an upload', async () => {
        await wrap(<ImageThumbs images={[{ name: 'x', url: '/api/files/uploads/..', isImage: true }]} />);
        expect(loader).not.toHaveBeenCalledWith('/api/files/uploads/..');
    });

    it('lifts a message\'s image links out of the bubble into the strip', async () => {
        const message: Message = {
            id: 1,
            session_id: 's',
            role: 'user',
            content: 'Compare these\n![a.png](/api/files/uploads/a.png)\n![b.jpg](/api/files/uploads/b.jpg)\n[notes.txt](/api/files/uploads/notes.txt)',
            created_at: '2026-11-13T14:05:09Z',
            rag_sources: null,
        };
        await wrap(
            <QueryClientProvider client={new QueryClient()}>
                <UserBubble message={message} />
            </QueryClientProvider>,
        );
        expect(screen.getAllByTestId('user-image-thumb')).toHaveLength(2);
        expect(screen.getAllByTestId('user-attachment')).toHaveLength(1);
    });
});
