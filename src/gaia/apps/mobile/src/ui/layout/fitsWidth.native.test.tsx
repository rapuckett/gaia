// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translate } from '@webui/i18n/registry';

import { Button, Row, ScrollBox, Text, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

// "رقم 1 في الدور (#1 in line)": the Arabic UI carries the English in brackets.
const glossed = translate('ar', 'row.inLine', { n: 1 });

describeNative('Arabic text keeps its room', () => {
    it('gives a glossed line twice its cap, so the clamp never cuts into the English', async () => {
        await render(
            <>
                <Text testID="glossed" numberOfLines={1}>{glossed}</Text>
                <Text testID="plain" numberOfLines={1}>Weekly planning notes</Text>
                <Text testID="compact" numberOfLines={1} compact>{glossed}</Text>
            </>,
            { wrapper: wrap },
        );
        expect(screen.getByTestId('glossed').props.numberOfLines).toBe(2);
        expect(screen.getByTestId('plain').props.numberOfLines).toBe(1);
        expect(screen.getByTestId('compact').props.numberOfLines).toBe(1);
    });

    it('lets a button shrink inside its row and wrap its label instead of running off the screen', async () => {
        await render(
            <Row gap="sm">
                <Button label={translate('ar', 'row.cancelRename')} />
                <Button label={translate('ar', 'row.saveName')} testID="save" />
            </Row>,
            { wrapper: wrap },
        );
        const outer = StyleSheet.flatten(screen.getByTestId('save').parent?.props.style);
        expect(outer).toMatchObject({ flexShrink: 1, maxWidth: '100%' });
        expect(screen.getByText(translate('ar', 'row.saveName')).props.numberOfLines).toBeUndefined();
    });

    it('keeps a wrapping row inside its parent row', async () => {
        await render(
            <Row testID="outer" wrap>
                <Row testID="inner" wrap>
                    <Text>{glossed}</Text>
                </Row>
            </Row>,
            { wrapper: wrap },
        );
        expect(StyleSheet.flatten(screen.getByTestId('inner').props.style).maxWidth).toBe('100%');
    });

    it('marks a scroll box that holds more below, until it is scrolled to the end', async () => {
        await render(
            <ScrollBox maxHeight={100} hint testID="box">
                <Text>{glossed}</Text>
            </ScrollBox>,
            { wrapper: wrap },
        );
        const box = screen.getByTestId('box');
        expect(screen.queryByTestId('box-more')).toBeNull();
        await act(async () => {
            fireEvent(box, 'layout', { nativeEvent: { layout: { width: 300, height: 100 } } });
            fireEvent(box, 'contentSizeChange', 300, 260);
        });
        expect(screen.getByTestId('box-more')).toBeTruthy();
        await act(async () => {
            fireEvent.scroll(box, { nativeEvent: { contentOffset: { x: 0, y: 160 } } });
        });
        expect(screen.queryByTestId('box-more')).toBeNull();
    });
});
