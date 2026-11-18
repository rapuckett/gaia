// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen, ThemeProvider } from '@/ui';
import { contentWidth, space } from '../tokens/space';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('Screen footer', () => {
    it('keeps the footer a gutter away from the screen edges', async () => {
        await render(<Screen footer={<Text>Actions</Text>} />, { wrapper: wrap });
        const style = StyleSheet.flatten(screen.getByTestId('screen-footer').props.style);
        expect(style.paddingHorizontal).toBe(space.gutter);
    });

    it('lets a bleed footer span the full width', async () => {
        await render(<Screen footerBleed footer={<Text>Actions</Text>} />, { wrapper: wrap });
        const style = StyleSheet.flatten(screen.getByTestId('screen-footer').props.style);
        expect(style?.paddingHorizontal).toBeUndefined();
    });

    it('draws a 1px line above a footer with a divider', async () => {
        await render(<Screen footerDivider footer={<Text>Actions</Text>} />, { wrapper: wrap });
        const style = StyleSheet.flatten(screen.getByTestId('screen-footer').props.style);
        expect(style.borderTopWidth).toBe(1);
        expect(style.paddingVertical).toBe(space.md);
    });
});

describeNative('Screen content width', () => {
    const column = () => StyleSheet.flatten(screen.getByTestId('screen-content').props.style);
    const footerColumn = () => StyleSheet.flatten(screen.getByTestId('screen-footer').props.children.props.style);

    it('caps a reading screen at 680 and centers it by default', async () => {
        await render(<Screen footer={<Text>Actions</Text>}><Text>Body</Text></Screen>, { wrapper: wrap });
        expect(column()).toMatchObject({ maxWidth: contentWidth.reading, width: '100%', alignSelf: 'center' });
        expect(footerColumn()).toMatchObject({ maxWidth: 680, alignSelf: 'center' });
        expect(screen.getByTestId('screen-content').props.dataSet).toEqual({ contentWidth: '680' });
    });

    it('caps a flow screen at 560, scrolling or not', async () => {
        await render(<Screen width="flow" scroll><Text>Body</Text></Screen>, { wrapper: wrap });
        expect(column().maxWidth).toBe(560);
    });

    it('leaves a full screen uncapped', async () => {
        await render(<Screen width="full"><Text>Body</Text></Screen>, { wrapper: wrap });
        expect(column().maxWidth).toBeUndefined();
        expect(screen.getByTestId('screen-content').props.dataSet).toEqual({ contentWidth: 'full' });
    });
});
