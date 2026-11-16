// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { pickPhotos } from './pickFiles';

jest.mock('expo-clipboard', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
// As iOS answers for a camera-roll photo: the HEIC original unless the picker asks for the most compatible form.
jest.mock('expo-image-picker', () => ({
    UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
    launchImageLibraryAsync: jest.fn(async (options: { preferredAssetRepresentationMode?: string }) => {
        const ext = options.preferredAssetRepresentationMode === 'compatible' ? 'jpg' : 'heic';
        return { canceled: false, assets: [{ uri: `file:///cache/ImagePicker/1.${ext}`, fileName: `IMG_0001.${ext}`, mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, fileSize: 9 }] };
    }),
}));

describe('pickPhotos', () => {
    it('asks for a JPEG, since the PC refuses the HEIC an iPhone photo is stored as', async () => {
        const [photo] = await pickPhotos();
        expect(photo).toMatchObject({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg' });
    });
});
