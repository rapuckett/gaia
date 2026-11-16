// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { savedNotice } from './knowledgeUi';

describe('savedNotice', () => {
    it('names the PC\'s reason when a memory could not be embedded, and falls back to the plain notice without one', () => {
        expect(savedNotice('en', { embedded: false, embed_error: 'Embedder is offline' }, false)).toEqual({ tone: 'danger', text: 'Embedder is offline' });
        expect(savedNotice('en', { embedded: false }, true)).toMatchObject({ tone: 'danger', text: 'Saved, but not embedded' });
    });

    it('says created or updated when the save went through', () => {
        expect(savedNotice('en', { embedded: true }, false)).toEqual({ tone: 'success', text: 'Memory created successfully' });
        expect(savedNotice('en', undefined, true)).toEqual({ tone: 'success', text: 'Memory updated' });
    });
});
