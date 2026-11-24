// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { FilePreview } from './FilePreview';

const mockDelete = jest.fn();
const mockWrite = jest.fn();
jest.mock('expo-file-system', () => ({
    Paths: { cache: 'file:///cache/' },
    Directory: class {
        create() {}
    },
    File: class {
        uri: string;
        exists = true;
        constructor(_folder: unknown, name: string) {
            this.uri = `file:///cache/pc-files/${name}`;
        }
        create() {}
        write(bytes: Uint8Array) {
            mockWrite(this.uri, bytes);
        }
        delete() {
            mockDelete(this.uri);
        }
    },
}));
jest.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async () => 'abc123'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn(async () => true) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const PHOTO = 'C:\\Users\\me\\photo.png';

describe('FilePreview', () => {
    beforeEach(() => {
        mockDelete.mockClear();
        mockWrite.mockClear();
    });
    // The sheet store outlives a test: a sheet left on it would show first in the next test's host, Share button and all.
    afterEach(() => act(() => sheetStore.reset()));

    it('caches the file under a hashed name, never its path, and deletes it when the preview closes', async () => {
        const client = createFakeClient({ fileBytes: { 'C:\\Users\\me\\secret plans.png': new Uint8Array([1, 2, 3]) } });
        const view = await render(
            <ThemeProvider>
                <GaiaClientProvider client={client}>
                    <FilePreview target={{ kind: 'path', path: 'C:\\Users\\me\\secret plans.png', sessionId: 's1' }} onClose={() => {}} />
                </GaiaClientProvider>
            </ThemeProvider>,
        );
        await waitFor(() => expect(mockWrite).toHaveBeenCalledTimes(1));
        expect(mockWrite.mock.calls[0]![0]).toBe('file:///cache/pc-files/abc123.png');
        expect(mockDelete).not.toHaveBeenCalled();
        await view.unmount();
        expect(mockDelete).toHaveBeenCalledWith('file:///cache/pc-files/abc123.png');
    });

    it("keeps the PC's text off the share-failure sentence, on its own left-to-right line", async () => {
        (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new GaiaApiError(500, 'disk full'));
        const client = createFakeClient({ fileBytes: { [PHOTO]: new Uint8Array([1]) } });
        await render(
            <ThemeProvider>
                <GaiaClientProvider client={client}>
                    <SheetHost>
                        <FilePreview target={{ kind: 'path', path: PHOTO, sessionId: 's1' }} onClose={() => {}} />
                    </SheetHost>
                </GaiaClientProvider>
            </ThemeProvider>,
        );
        await fireEvent.press(await screen.findByText(t('cards.share')));

        expect(await screen.findByText(t('mobileApp.error.shareFailed'))).toBeTruthy();
        expect(screen.getByText('500 disk full').props.style).toMatchObject({ writingDirection: 'ltr' });
    });
});
