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

    const chipOf = async (props: { mode: 'ask' | 'full_access' | null; readFailed?: boolean }) => {
        await render(
            <ThemeProvider>
                <PermissionChip {...props} onChange={() => undefined} />
            </ThemeProvider>,
        );
        return screen.getByTestId('permission-chip');
    };

    it('says it is checking while the saved mode is unread, not Ask', async () => {
        const chip = await chipOf({ mode: null });
        expect(screen.getByText('Checking…')).toBeTruthy();
        expect(screen.queryByText('Ask')).toBeNull();
        expect(chip.props['aria-label'] ?? chip.props.accessibilityLabel).toBe('Permission mode: Checking…');
    });

    it('says unknown when the read failed', async () => {
        const chip = await chipOf({ mode: null, readFailed: true });
        expect(screen.getByText('Unknown')).toBeTruthy();
        expect(chip.props['aria-label'] ?? chip.props.accessibilityLabel).toBe('Permission mode: Unknown');
    });

    it('shows a lasting full-access grant apart from asking each time', async () => {
        const ask = await chipOf({ mode: 'ask' });
        const askLabel = ask.props['aria-label'] ?? ask.props.accessibilityLabel;
        expect(screen.getByText('Ask')).toBeTruthy();
        await screen.unmount();
        const full = await chipOf({ mode: 'full_access' });
        expect(screen.getByText('Full access')).toBeTruthy();
        expect(full.props['aria-label'] ?? full.props.accessibilityLabel).not.toBe(askLabel);
    });
});
