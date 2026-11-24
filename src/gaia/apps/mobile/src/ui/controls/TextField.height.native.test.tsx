// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { TextField, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

async function minHeightOf(value: string) {
    await render(
        <ThemeProvider>
            <TextField testID="f" value={value} onChangeText={jest.fn()} multiline bare maxLines={9} />
        </ThemeProvider>,
    );
    return StyleSheet.flatten(screen.getByTestId('f').props.style).minHeight as number;
}

// A draft the app sets (a restored queue, a skill prompt) fires no typing event, so the box must still show every line.
describeNative('Multiline field height for a value set by the app', () => {
    it('grows with the line breaks, up to the maximum', async () => {
        const one = await minHeightOf('one');
        const two = await minHeightOf('one\n\ntwo');
        const many = await minHeightOf(Array(30).fill('x').join('\n'));
        expect(two).toBeGreaterThan(one);
        expect(many).toBeGreaterThan(two);
        expect(many).toBeLessThanOrEqual(await minHeightOf(Array(9).fill('x').join('\n')));
    });
});
