// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UIProvider } from '@/ui';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { PrivateChip } from './PrivateChip';

const opts = { includeHiddenElements: true };
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

function Harness({ start = false }: { start?: boolean }) {
    const [on, setOn] = useState(start);
    return (
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <PrivateChip on={on} onChange={setOn} memoryEnabled />
            </UIProvider>
        </SafeAreaProvider>
    );
}

describeNative('PrivateChip menu', () => {
    beforeEach(() => sheetStore.reset());

    it('opens a menu with both choices and their notes', async () => {
        await render(<Harness />);
        const chip = screen.getByTestId('private-chip', opts);
        expect(chip.props['aria-haspopup']).toBe('menu');
        expect(chip.props.accessibilityLabel).toBe('Memory for this chat: Remember across chats: on');
        expect(screen.queryByText('Private chat', opts)).toBeNull();
        await fireEvent.press(chip);
        expect(await screen.findByText('Memory for this chat', opts)).toBeTruthy();
        expect(screen.getByText('Remember this chat', opts)).toBeTruthy();
        expect(screen.getByText('Private chat', opts)).toBeTruthy();
        expect(screen.getByText(/GAIA can learn from this chat/, opts)).toBeTruthy();
        expect(screen.getByText(/Not saved to memory/, opts)).toBeTruthy();
    });

    it('choosing Private chat sets the flag and the chip shows it', async () => {
        await render(<Harness />);
        await fireEvent.press(screen.getByTestId('private-chip', opts));
        await fireEvent.press(await screen.findByTestId('private-choice-private', opts));
        expect(screen.getByTestId('private-chip', opts).props.accessibilityLabel).toBe('Memory for this chat: Private');
    });

    it('choosing Remember clears the flag', async () => {
        await render(<Harness start />);
        await fireEvent.press(screen.getByTestId('private-chip', opts));
        await fireEvent.press(await screen.findByTestId('private-choice-remember', opts));
        expect(screen.getByTestId('private-chip', opts).props.accessibilityLabel).toBe('Memory for this chat: Remember across chats: on');
    });
});
