// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Notice, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

function hasAccessibleAncestor(node: { parent: unknown; props: Record<string, unknown> } | null): boolean {
    for (let n = node?.parent as typeof node; n; n = n.parent as typeof node) {
        if (n.props.accessible === true) return true;
    }
    return false;
}

describeNative('Notice and VoiceOver', () => {
    it('keeps the dismiss button outside any accessible ancestor, and the text block readable as one element', async () => {
        const notice: ReactElement = <Notice tone="danger" message="Saved" onDismiss={() => {}} testID="n" />;
        await render(notice, { wrapper: wrap });
        expect(hasAccessibleAncestor(screen.getByLabelText('Dismiss') as never)).toBe(false);
        expect(screen.getByTestId('n').props.accessible).not.toBe(true);
        expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('is one element when it has no buttons', async () => {
        await render(<Notice tone="warning" message="Careful" testID="n" />, { wrapper: wrap });
        expect(screen.getByTestId('n').props.accessible).toBe(true);
    });
});
