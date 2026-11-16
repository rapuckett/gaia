// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act } from 'react';
import { createRoot } from 'test-renderer';

import { GaiaApiError } from '@/api/errors';

import { pickedFromPaste } from './pickFiles';
import { useAttachments, type Attachments } from './useAttachments';

const mockUpload = jest.fn((..._args: unknown[]) => new Promise(() => {}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-clipboard', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/data', () => ({
    useGaiaClient: () => ({}),
    requireClient: () => ({ uploadFile: (...args: unknown[]) => mockUpload(...args) }),
}));
jest.mock('@/i18n/useT', () => ({
    useT: () => (key: string) => key,
    describeError: () => 'failed',
}));

describe('useAttachments', () => {
    it('keeps one chip when the same file is picked twice from different cache paths', async () => {
        let attachments!: Attachments;
        function Probe() {
            attachments = useAttachments();
            return null;
        }
        const r = createRoot();
        await act(async () => r.render(<Probe />));
        const pick = (uri: string) => ({ uri, name: 'a.pdf', size: 10, modified: 5 });
        await act(async () => attachments.add([pick('file:///cache/1/a.pdf')]));
        await act(async () => attachments.add([pick('file:///cache/2/a.pdf')]));
        expect(attachments.items).toHaveLength(1);
    });

    describe('a pasted file', () => {
        const probe = async () => {
            let attachments!: Attachments;
            function Probe() {
                attachments = useAttachments();
                return null;
            }
            const r = createRoot();
            await act(async () => r.render(<Probe />));
            return () => attachments;
        };
        beforeAll(() => {
            URL.createObjectURL = jest.fn(() => 'blob:pasted');
        });

        it('uploads the pasted bytes and names an unnamed image like a screenshot', async () => {
            mockUpload.mockClear();
            const get = await probe();
            const image = new Blob(['png'], { type: 'image/png' });
            await act(async () => get().add(pickedFromPaste([image])));
            expect(get().items[0]).toMatchObject({ isImage: true, name: expect.stringMatching(/^screenshot-.*\.png$/) });
            expect(mockUpload.mock.calls[0][0]).toBe(image);
        });

        it('shows the same refusal as a picked file when the PC refuses the type', async () => {
            mockUpload.mockRejectedValueOnce(new GaiaApiError(400, 'no', undefined, undefined, { status: 'unsupported_type', extension: '.exe' }));
            const get = await probe();
            await act(async () => get().add(pickedFromPaste([new Blob(['x'], { type: 'application/octet-stream' })])));
            expect(get().items[0]).toMatchObject({ status: 'failed', error: 'composer.upload.unsupported' });
        });
    });
});
