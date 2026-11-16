// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { attachPasted } from './AttachButton';
import * as pick from './pickFiles';

jest.mock('./pickFiles', () => ({ pasteImage: jest.fn() }));
jest.mock('@/i18n/useT', () => ({ describeError: (e: Error) => e.message, useT: () => (k: string) => k }));
jest.mock('@/ui', () => ({}));
jest.mock('@/ui/icons', () => ({}));

describe('attachPasted', () => {
    it('shows a failed clipboard read as a failed chip instead of dropping it', async () => {
        (pick.pasteImage as jest.Mock).mockRejectedValueOnce(new Error('cache full'));
        const onPick = jest.fn();
        const onError = jest.fn();
        await attachPasted(onPick, onError, ((k: string) => k) as never);
        expect(onError).toHaveBeenCalledWith('mobileApp.composer.attachPaste', 'cache full');
        expect(onPick).not.toHaveBeenCalled();
    });
});
