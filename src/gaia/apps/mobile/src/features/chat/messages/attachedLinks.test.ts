// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { composeWithLinks } from '@webui/utils/attachmentLinks';

import { splitAttachmentLinks } from './attachedLinks';

describe('splitAttachmentLinks', () => {
    it('reads back what composeWithLinks sends, and leaves ordinary links in the text', () => {
        const files = [
            { name: 'smoke-notes.txt', serverUrl: '/api/files/uploads/smoke-notes.txt', isImage: false },
            { name: 'photo.png', serverUrl: '/api/files/uploads/photo.png', isImage: true },
        ];
        const sent = composeWithLinks('Summarize these', files, 'Transcribe');
        expect(splitAttachmentLinks(sent)).toEqual({
            text: 'Summarize these',
            files: [
                { name: 'smoke-notes.txt', url: '/api/files/uploads/smoke-notes.txt', isImage: false },
                { name: 'photo.png', url: '/api/files/uploads/photo.png', isImage: true },
            ],
        });
        const plain = 'See [the docs](https://example.com/x)';
        expect(splitAttachmentLinks(plain)).toEqual({ text: plain, files: [] });
    });
});
