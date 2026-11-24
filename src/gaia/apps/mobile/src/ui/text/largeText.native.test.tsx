// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AX_FONT_SCALE, atFontScale } from '@/test-support/fontScale';
import { Button, Chip, Icon, ListRow, Notice, Row, Text, ThemeProvider } from '@/ui';
import { Bell } from '@/ui/icons';
import { metrics } from '@/ui/tokens/generated';
import { typeScale } from '@/ui/tokens/type';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const styleOf = (node: { props: { style?: unknown } } | null | undefined) => StyleSheet.flatten(node?.props.style as never) ?? {};

afterEach(() => jest.restoreAllMocks());

describeNative('text at the largest iOS sizes', () => {
    it('lets a one-line text wrap, but keeps a compact label to one line at a capped size', async () => {
        atFontScale(3);
        await render(
            <>
                <Text numberOfLines={1} testID="title">A long row title</Text>
                <Text numberOfLines={1} compact testID="chip">Chip</Text>
            </>,
            { wrapper: wrap },
        );
        expect(screen.getByTestId('title').props.numberOfLines).toBeUndefined();
        expect(screen.getByTestId('chip').props.numberOfLines).toBe(1);
        expect(screen.getByTestId('chip').props.maxFontSizeMultiplier).toBe(1.3);
    });

    it('sizes a capped row icon box from the capped line height', async () => {
        atFontScale(AX_FONT_SCALE);
        const line = Math.round(typeScale.ui * metrics.lineHeight);
        await render(
            <>
                <ListRow title="Memory" titleMaxScale={2} leading={<Icon icon={Bell} />} />
                <ListRow title="Chat" leading={<Icon icon={Bell} />} />
            </>,
            { wrapper: wrap },
        );
        const [capped, uncapped] = screen.getAllByTestId('first-line');
        expect(styleOf(capped).minHeight).toBe(line * 2);
        expect(styleOf(uncapped).minHeight).toBe(line * AX_FONT_SCALE);
    });

    it('keeps the one-line text at the default size', async () => {
        atFontScale(1);
        await render(<Text numberOfLines={1} testID="title">A long row title</Text>, { wrapper: wrap });
        expect(screen.getByTestId('title').props.numberOfLines).toBe(1);
    });

    it('wraps a label beside its value, and lets both shrink', async () => {
        atFontScale(3);
        await render(
            <Row justify="between" testID="row">
                <Text>Label</Text>
                <Text>Value</Text>
            </Row>,
            { wrapper: wrap },
        );
        expect(screen.getByTestId('row').props.style).toMatchObject({ flexWrap: 'wrap' });
        expect(screen.getByText('Label').parent?.props.style).toMatchObject({ flexShrink: 1 });
    });
});

describeNative('controls at AX5', () => {
    beforeEach(() => atFontScale(AX_FONT_SCALE));

    it('shows a list row title in full, with its icon centered on the first line', async () => {
        await render(<ListRow title="Notifications and alerts" leading={<Icon icon={Bell} size="sm" />} onPress={() => {}} />, { wrapper: wrap });
        expect(screen.getByText('Notifications and alerts').props.numberOfLines).toBeUndefined();
        const firstLine = Math.round(typeScale.ui * metrics.lineHeight) * AX_FONT_SCALE;
        expect(styleOf(screen.getByTestId('first-line')).minHeight).toBeCloseTo(firstLine);
    });

    it('caps titles at 2x and lets body text scale fully', async () => {
        await render(
            <>
                <Text role="title">Model</Text>
                <Text role="body">Runs on your PC</Text>
            </>,
            { wrapper: wrap },
        );
        expect(screen.getByText('Model').props.maxFontSizeMultiplier).toBe(2);
        expect(screen.getByText('Runs on your PC').props.maxFontSizeMultiplier).toBeUndefined();
    });

    it('keeps a chat title to two lines', async () => {
        await render(<ListRow title="A chat with a very long title" titleLargeLines={2} onPress={() => {}} />, { wrapper: wrap });
        expect(screen.getByText('A chat with a very long title').props.numberOfLines).toBe(2);
    });

    it('caps a chip label and keeps its 44 pt target', async () => {
        await render(<Chip label="Background chats" onPress={() => {}} />, { wrapper: wrap });
        expect(screen.getByText('Background chats').props.maxFontSizeMultiplier).toBe(1.3);
        const chip = screen.getByRole('button', { name: 'Background chats' });
        fireEvent(chip, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 32 } } });
        const slop = screen.getByRole('button', { name: 'Background chats' }).props.hitSlop;
        expect(32 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    });

    it('stacks a pair of buttons, each full width', async () => {
        await render(
            <Row gap="sm" stack testID="pair">
                <Button label="Cancel" />
                <Button label="Save" variant="primary" />
            </Row>,
            { wrapper: wrap },
        );
        expect(styleOf(screen.getByTestId('pair'))).toMatchObject({ flexDirection: 'column', alignItems: 'stretch' });
        for (const name of ['Cancel', 'Save']) expect(styleOf(screen.getByRole('button', { name }).parent)).toMatchObject({ alignSelf: 'stretch' });
    });

    it("gives a notice's action the full width", async () => {
        await render(<Notice tone="danger" message="Offline" action={{ label: 'Check again', onPress: () => {} }} />, { wrapper: wrap });
        expect(styleOf(screen.getByRole('button', { name: 'Check again' }).parent)).toMatchObject({ alignSelf: 'stretch' });
    });
});
