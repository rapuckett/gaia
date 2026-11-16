// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { AX_FONT_SCALE, atFontScale } from '@/test-support/fontScale';
import { Button, ThemeProvider } from '@/ui';

import { SetupFooter, SetupFooterBar, SetupFooterMuted, SetupFooterProvider } from './SetupFooter';

function Setup({ covered }: { covered: boolean }) {
    return (
        <SetupFooterProvider>
            <SetupFooterMuted muted={covered}>
                <SetupFooter>
                    <Text>Plan action</Text>
                </SetupFooter>
            </SetupFooterMuted>
            {covered ? (
                <SetupFooter>
                    <Text>Screen action</Text>
                </SetupFooter>
            ) : null}
            <SetupFooterBar />
        </SetupFooterProvider>
    );
}

describe('SetupFooterMuted', () => {
    it("keeps a covered step's actions out of the bar, and brings them back when it is uncovered", async () => {
        const { rerender } = await render(<Setup covered />, { wrapper: ThemeProvider });
        expect(screen.getByText('Screen action')).toBeTruthy();
        expect(screen.queryByText('Plan action')).toBeNull();

        await rerender(<Setup covered={false} />);
        expect(screen.getByText('Plan action')).toBeTruthy();
        expect(screen.queryByText('Screen action')).toBeNull();
    });
});

describe('SetupFooterBar', () => {
    it('gives each action an equal flex slot', async () => {
        await render(
            <SetupFooterProvider>
                <SetupFooter>
                    <Text>Customize</Text>
                    <Text>Download and start</Text>
                </SetupFooter>
                <SetupFooterBar />
            </SetupFooterProvider>,
            { wrapper: ThemeProvider },
        );
        const slots = screen.getAllByTestId('setup-footer-slot');
        expect(slots).toHaveLength(2);
        for (const slot of slots) expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
    });
});

describe('SetupFooterBar at the largest text size', () => {
    afterEach(() => jest.restoreAllMocks());

    it('stacks both actions full width instead of sharing a row', async () => {
        atFontScale(AX_FONT_SCALE);
        await render(
            <SetupFooterProvider>
                <SetupFooter>
                    <Button label="Customize" />
                    <Button label="Download and start" variant="primary" />
                </SetupFooter>
                <SetupFooterBar />
            </SetupFooterProvider>,
            { wrapper: ThemeProvider },
        );
        expect(screen.queryAllByTestId('setup-footer-slot')).toHaveLength(0);
        for (const name of ['Customize', 'Download and start']) {
            expect(StyleSheet.flatten(screen.getByRole('button', { name }).parent?.props.style)).toMatchObject({ alignSelf: 'stretch' });
        }
    });
});

describe('SetupFooterBar with uneven actions', () => {
    async function renderPair() {
        await render(
            <SetupFooterProvider>
                <SetupFooter>
                    <Button label="Try again" />
                    <Button label="Use GAIA's own instead" variant="primary" />
                </SetupFooter>
                <SetupFooterBar />
            </SetupFooterProvider>,
            { wrapper: ThemeProvider },
        );
        return screen.getAllByTestId('setup-footer-slot');
    }
    const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 150, height } } });

    it('stacks the actions when one is far taller than the other', async () => {
        const slots = await renderPair();
        await fireEvent(slots[0], 'layout', layout(44));
        await fireEvent(slots[1], 'layout', layout(120));
        expect(screen.queryAllByTestId('setup-footer-slot')).toHaveLength(0);
        for (const name of ['Try again', "Use GAIA's own instead"]) {
            expect(StyleSheet.flatten(screen.getByRole('button', { name }).parent?.props.style)).toMatchObject({ alignSelf: 'stretch' });
        }
    });

    it('keeps a row when the heights are close', async () => {
        const slots = await renderPair();
        await fireEvent(slots[0], 'layout', layout(44));
        await fireEvent(slots[1], 'layout', layout(60));
        expect(screen.getAllByTestId('setup-footer-slot')).toHaveLength(2);
    });
});
