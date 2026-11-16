// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Disclosure, ThemeProvider } from '@/ui';
import { space } from '@/ui/tokens/space';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Disclosure body indent', () => {
    it('indents the open body with paddingStart, never a left padding or margin', async () => {
        await render(
            <Disclosure title="Agent info" open onToggle={() => {}} testID="d">
                <Text testID="item">search_web</Text>
            </Disclosure>,
            { wrapper: wrap },
        );
        let body = screen.getByTestId('item').parent as { parent: unknown; props: Record<string, unknown> } | null;
        while (body && StyleSheet.flatten(body.props.style as never)?.paddingStart === undefined) body = body.parent as typeof body;
        expect(body).not.toBeNull();
        const style = StyleSheet.flatten(body!.props.style as never);
        expect(style.paddingStart).toBe(space.xl);
        expect(style).not.toHaveProperty('paddingLeft');
        expect(style).not.toHaveProperty('marginLeft');
    });
});
