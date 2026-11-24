// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';
import { IconButton, Row, ThemeProvider } from '@/ui';
import { Copy } from '@/ui/icons';

import { ReadAloudButton, ReadAloudErrorNotice, type ReadAloudControl } from './ReadAloud';
import { useReadAloudStore } from './readAloudStore';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const control = (extra: Partial<ReadAloudControl>): ReadAloudControl => ({ active: false, loading: false, label: 'Read aloud', toggle: () => undefined, ...extra });

describeNative('read aloud polish', () => {
    afterEach(() => useReadAloudStore.setState({ messageId: null, status: null, error: null }));

    it('folds the PC text under a closed Details with its own left-to-right line', async () => {
        const text = "HTTPConnectionPool(host='localhost'): [Errno 61] Connection refused";
        useReadAloudStore.setState({ error: { messageId: 'm', kind: 'unreachable', cause: new GaiaApiError(503, text) } });
        await render(<ReadAloudErrorNotice messageId="m" />, { wrapper: wrap });
        expect(screen.getByText("Couldn't read this aloud: the model server isn't answering.")).toBeTruthy();
        expect(screen.queryByText(text)).toBeNull();
        await fireEvent.press(screen.getByTestId('read-aloud-details-toggle'));
        expect(screen.getByText(text, { exact: false })).toBeTruthy();
        expect(screen.getByTestId('read-aloud-details-text')).toHaveTextContent(text, { exact: false });
    });

    it('shows no Details when the PC gave no text', async () => {
        useReadAloudStore.setState({ error: { messageId: 'm', kind: 'unavailable', cause: new GaiaApiError(409, 'x') } });
        await render(<ReadAloudErrorNotice messageId="m" />, { wrapper: wrap });
        expect(screen.queryByTestId('read-aloud-details-toggle')).toBeNull();
    });

    it('keeps the row still while generating: the ring is an overlay, not a sibling in the row', async () => {
        const row = (c: ReadAloudControl) => (
            <Row testID="row">
                <ReadAloudButton control={c} />
                <IconButton icon={Copy} label="Copy" size="sm" />
            </Row>
        );
        const view = await render(row(control({})), { wrapper: wrap });
        const count = () => screen.getByTestId('row').children.length;
        const idle = count();
        expect(screen.queryByTestId('read-aloud-ring')).toBeNull();
        await act(async () => view.rerender(row(control({ loading: true, active: true, label: 'Stop reading' }))));
        expect(count()).toBe(idle);
        const ring = screen.getByTestId('read-aloud-ring');
        expect(ring.props.pointerEvents).toBe('none');
        expect(screen.getByLabelText('Stop reading')).toBeTruthy();
        expect(ring.parent?.props['aria-busy']).toBe(true);
    });

    it('announces the preparing line once when generation starts', async () => {
        const preparing = translator('en')('readAloud.preparing');
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        const view = await render(<ReadAloudButton control={control({})} />, { wrapper: wrap });
        announce.mockClear();
        const loading = control({ loading: true, active: true, label: 'Stop reading' });
        await act(async () => view.rerender(<ReadAloudButton control={loading} />));
        await act(async () => view.rerender(<ReadAloudButton control={{ ...loading }} />));
        if (Platform.OS === 'ios') expect(announce.mock.calls).toEqual([[preparing]]);
        else {
            expect(announce).not.toHaveBeenCalled();
            expect(screen.getByLabelText(preparing).props.accessibilityLiveRegion).toBe('polite');
        }
        announce.mockRestore();
    });
});
