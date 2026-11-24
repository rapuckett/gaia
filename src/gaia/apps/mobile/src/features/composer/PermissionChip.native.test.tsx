// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ThemeProvider } from '@/ui';

import { PermissionChip } from './PermissionChip';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('PermissionChip', () => {
    it('declares that it opens a menu, so a screen reader and the shot tool do not treat it as a disclosure', async () => {
        await render(
            <ThemeProvider>
                <PermissionChip mode="ask" onChange={() => undefined} />
            </ThemeProvider>,
        );
        const chip = screen.getByTestId('permission-chip');
        expect(chip.props['aria-haspopup']).toBe('menu');
    });
});
