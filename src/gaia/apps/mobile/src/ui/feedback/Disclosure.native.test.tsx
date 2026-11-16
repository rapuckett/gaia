// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Disclosure, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Disclosure body indent', () => {
    // Web keeps I18nManager LTR, so paddingStart/marginStart resolve to the left side in Arabic; a row spacer follows the page direction on both.
    it('indents with a row spacer, never a start padding or margin', async () => {
        await render(
            <Disclosure title="Agent info" open onToggle={() => {}} testID="d">
                <Text testID="item">search_web</Text>
            </Disclosure>,
            { wrapper: wrap },
        );
        let body = screen.getByTestId('item').parent as { parent: unknown; props: Record<string, unknown> } | null;
        while (body && StyleSheet.flatten(body.props.style as never)?.flexDirection !== 'row') body = body.parent as typeof body;
        expect(body).not.toBeNull();
        const style = StyleSheet.flatten(body!.props.style as never);
        expect(style).not.toHaveProperty('paddingStart');
        expect(style).not.toHaveProperty('paddingLeft');
        expect(style).not.toHaveProperty('marginStart');
        const [spacer] = (body as unknown as { children: { props: Record<string, unknown> }[] }).children;
        expect(StyleSheet.flatten(spacer!.props.style as never)?.width).toBeGreaterThan(0);
    });
});
