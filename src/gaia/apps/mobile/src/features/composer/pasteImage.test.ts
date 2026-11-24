// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';

import { pasteImage } from './pickFiles';

const mockWrite = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('expo-clipboard', () => ({ getImageAsync: jest.fn(), hasImageAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system', () => ({
    Paths: { cache: 'file:///cache/' },
    File: class {
        uri: string;
        constructor(dir: string, name: string) {
            this.uri = dir + name;
        }
        create() {}
        write(...args: unknown[]) {
            return mockWrite(...args);
        }
    },
}));

describe('pasteImage', () => {
    it('saves the clipboard image as a png file without the data-URL prefix', async () => {
        (Clipboard.getImageAsync as jest.Mock).mockResolvedValueOnce({ data: 'data:image/png;base64,QUJD' });
        const [file] = await pasteImage();
        expect(mockWrite).toHaveBeenCalledWith('QUJD', { encoding: 'base64' });
        expect(file).toMatchObject({ mimeType: 'image/png', uri: expect.stringMatching(/^file:\/\/\/cache\/screenshot-.*\.png$/) });
    });

    it('attaches nothing when the clipboard holds no image', async () => {
        (Clipboard.getImageAsync as jest.Mock).mockResolvedValueOnce(null);
        expect(await pasteImage()).toEqual([]);
    });
});
