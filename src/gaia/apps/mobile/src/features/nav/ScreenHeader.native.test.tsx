// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Dimensions } from 'react-native';

import { ThemeProvider } from '@/ui';

import { PERMANENT_DRAWER_MIN_WIDTH } from './navigation';
import { ScreenHeader } from './ScreenHeader';

jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: jest.fn() }) }));

function mountAt(width: number) {
    Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
    return render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <ScreenHeader title="Settings" />
            </ThemeProvider>
        </SafeAreaProvider>,
    );
}

describe('ScreenHeader hamburger', () => {
    it.each([390, 768, PERMANENT_DRAWER_MIN_WIDTH - 1])('shows at %i wide', async (width) => {
        await mountAt(width);
        expect(screen.getByLabelText('Open sidebar')).toBeTruthy();
    });

    it.each([PERMANENT_DRAWER_MIN_WIDTH, 1366])('is hidden at %i wide', async (width) => {
        await mountAt(width);
        expect(screen.queryByLabelText('Open sidebar')).toBeNull();
    });
});
