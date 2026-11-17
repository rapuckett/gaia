// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';
import { space } from '@/ui/tokens/space';

import { MemoryTabs } from './MemoryTabs';

describe('MemoryTabs', () => {
    it('pads the tab strip by the screen gutter on both sides', async () => {
        await render(
            <QueryClientProvider client={new QueryClient()}>
                <GaiaClientProvider client={createFakeClient({})}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <MemoryTabs value="about" onChange={() => undefined} />
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        const style = StyleSheet.flatten(screen.getByTestId('memory-tablist').props.style);
        expect(space.gutter).toBeGreaterThan(0);
        expect(style.paddingLeft ?? style.paddingHorizontal).toBe(space.gutter);
        expect(style.paddingRight ?? style.paddingHorizontal).toBe(space.gutter);
    });
});
