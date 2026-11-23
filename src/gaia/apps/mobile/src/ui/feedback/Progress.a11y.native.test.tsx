// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { walk } from '@/test-support/a11y';
import { ProgressLine, Spinner, ThemeProvider } from '@/ui';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

afterEach(() => jest.restoreAllMocks());

describeNative('Spinner accessibility', () => {
    it('with a label it is a named progress bar in a polite live region, announced once on iOS', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        announce.mockClear();
        const view = await render(<Spinner accessibilityLabel="Starting the agent" />, { wrapper: wrap });
        const node = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(node?.props.accessibilityLabel).toBe('Starting the agent');
        expect(node?.props.accessibilityLiveRegion).toBe('polite');
        await view.rerender(<Spinner accessibilityLabel="Starting the agent" />);
        expect(announce.mock.calls.length).toBe(Platform.OS === 'ios' ? 1 : 0);
        view.unmount();
    });

    it('without a label it stays silent', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        announce.mockClear();
        await render(<Spinner />, { wrapper: wrap });
        expect(walk().some((n) => n.props.accessibilityRole === 'progressbar')).toBe(false);
        expect(announce).not.toHaveBeenCalled();
    });
});

describeNative('ProgressLine accessibility', () => {
    it('a bar with no visible label takes its name from accessibilityLabel, with a 0 to 100 value', async () => {
        await render(<ProgressLine value={0.4} accessibilityLabel="Downloading gaiacpp" />, { wrapper: wrap });
        const bar = walk().find((n) => n.props.accessibilityRole === 'progressbar');
        expect(bar?.props.accessibilityLabel).toBe('Downloading gaiacpp');
        expect(bar?.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40 });
    });

    it('the visible label names the bar when no accessibilityLabel is given', async () => {
        await render(<ProgressLine value={0.4} label="Indexing" />, { wrapper: wrap });
        expect(walk().find((n) => n.props.accessibilityRole === 'progressbar')?.props.accessibilityLabel).toBe('Indexing');
    });
});
