// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isolate } from '@webui/i18n/registry';

import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { AttachmentChips } from './AttachmentChips';
import type { Attachments } from './useAttachments';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const ENGLISH = 'This file is empty.';
const error = `${isolate('هذا الملف فارغ.', 'rtl')} ${isolate(`(${ENGLISH})`, 'ltr')}`;

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => useLocaleStore.getState().setLocale(null));

describeNative('AttachmentChips', () => {
    it('keeps a failed chip status gloss inline, off the chip border', async () => {
        const attachments = {
            items: [{ id: '1', name: 'notes.doc', uri: 'file:///notes.doc', isImage: false, isMedia: false, key: 'k', status: 'failed', error }],
            remove: () => undefined,
        } as unknown as Attachments;
        await render(<AttachmentChips attachments={attachments} />, { wrapper: wrap });
        expect(screen.getByTestId('composer-attachments')).toHaveTextContent(`(${ENGLISH})`, { exact: false });
        expect(screen.queryByText(ENGLISH)).toBeNull();
    });
});
