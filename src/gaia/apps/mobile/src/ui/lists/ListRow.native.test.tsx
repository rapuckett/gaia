// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { IconButton, ThemeProvider } from '@/ui';
import { Ellipsis } from '@/ui/icons';

import { ListRow } from './ListRow';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('ListRow with a trailing control', () => {
    it('keeps the trailing button beside the pressable row, so iOS does not hide it', async () => {
        const onPress = jest.fn();
        const onMore = jest.fn();
        await render(
            <ThemeProvider>
                <ListRow
                    title="Budget"
                    accessibilityLabel="Budget chat"
                    testID="row"
                    onPress={onPress}
                    trailing={<IconButton icon={Ellipsis} size="sm" label="More actions for Budget" onPress={onMore} />}
                />
            </ThemeProvider>,
        );
        const more = screen.getByLabelText('More actions for Budget');
        const row = screen.getByTestId('row');
        for (let node = more.parent; node; node = node.parent) expect(node).not.toBe(row);
        fireEvent.press(more);
        expect(onMore).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });
});
