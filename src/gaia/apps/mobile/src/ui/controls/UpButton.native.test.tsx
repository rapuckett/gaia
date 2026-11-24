// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { ThemeProvider } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { UpButton } from './UpButton';

jest.mock('../icons', () => ({ ArrowLeft: 'ArrowLeft', ChevronLeft: 'ChevronLeft' }));
jest.mock('./IconButton', () => ({ IconButton: jest.fn(() => null) }));

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const t = translator('en');
const mocked = IconButton as unknown as jest.Mock;

async function props(os: 'ios' | 'android' | 'web', up: Parameters<typeof UpButton>[0] = {}) {
    jest.replaceProperty(Platform, 'OS', os);
    mocked.mockClear();
    await render(<UpButton {...up} />, { wrapper: wrap });
    return mocked.mock.calls[0][0];
}

describe('UpButton', () => {
    afterEach(() => jest.restoreAllMocks());

    it('is a chevron labeled Back on iOS', async () => {
        const p = await props('ios');
        expect(p.icon).toBe('ChevronLeft');
        expect(p.label).toBe(t('mobileApp.nav.back'));
    });

    it('is an arrow labeled Navigate up on Android and web', async () => {
        for (const os of ['android', 'web'] as const) {
            const p = await props(os);
            expect(p.icon).toBe('ArrowLeft');
            expect(p.label).toBe(t('mobileApp.nav.up'));
        }
    });

    it('lets a caller set the label', async () => {
        expect((await props('ios', { label: 'Back to Settings' })).label).toBe('Back to Settings');
    });
});
