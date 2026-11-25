// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { LogView } from './LogView';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const READ = {
    available: true,
    source: 'file',
    log_path: 'example-server.log',
    cursor: '9',
    dropped: 0,
    lines: [
        { text: 'INFO fine line', severity: 'info' },
        { text: 'ERROR broken line', severity: 'error' },
    ],
};

async function mountView(follow = false) {
    const { fetch, calls } = createRecordingFetch(() => jsonResponse(READ));
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <LogView source="gaia" file="example-server.log" active initialFollow={follow} />
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { calls };
}

describeNative('LogView controls over HTTP', () => {
    it('the warnings-only chip filters on the phone: no request, and no level parameter, ever goes out', async () => {
        const { calls } = await mountView();
        expect(await screen.findByText(/fine line/)).toBeTruthy();
        const chip = screen.getByTestId('log-problems-only');
        expect(chip).not.toBeChecked();
        await fireEvent.press(chip);
        expect(screen.getByTestId('log-problems-only')).toBeChecked();
        expect(screen.queryByText(/fine line/)).toBeNull();
        expect(screen.getByText(/broken line/)).toBeTruthy();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${BASE}/api/logs/gaia?file=example-server.log`);
        await fireEvent.press(screen.getByTestId('log-problems-only'));
        expect(screen.getByText(/fine line/)).toBeTruthy();
    });

    it('the follow chip is a checkbox that flips, and a refresh reads again from the top', async () => {
        const { calls } = await mountView(true);
        await screen.findByText(/fine line/);
        expect(screen.getByTestId('log-follow')).toBeChecked();
        await fireEvent.press(screen.getByTestId('log-follow'));
        expect(screen.getByTestId('log-follow')).not.toBeChecked();
        await fireEvent.press(screen.getByTestId('log-refresh'));
        await waitFor(() => expect(calls.length).toBeGreaterThan(1));
        expect(calls[calls.length - 1]!.url).toBe(`${BASE}/api/logs/gaia?file=example-server.log`);
    });

    it('Refresh, Copy and Share are icon buttons with their action labels, and copy and share send the shown text', async () => {
        const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
        await mountView();
        await screen.findByText(/fine line/);
        expect(screen.getByLabelText('Refresh')).toBe(screen.getByTestId('log-refresh'));
        expect(screen.getByLabelText('Copy')).toBe(screen.getByTestId('log-copy'));
        expect(screen.getByLabelText('Share')).toBe(screen.getByTestId('log-share'));
        await fireEvent.press(screen.getByTestId('log-problems-only'));
        await fireEvent.press(screen.getByTestId('log-copy'));
        expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ERROR broken line');
        await fireEvent.press(screen.getByTestId('log-share'));
        expect(share).toHaveBeenCalledWith({ message: 'ERROR broken line' });
        share.mockRestore();
    });

    it('the log text is caption-size mono', async () => {
        await mountView();
        const block = await screen.findByLabelText('GAIA');
        const style = [block.props.style].flat(Infinity).filter(Boolean).reduce((a, s) => ({ ...a, ...s }), {});
        expect(style.fontSize).toBe(13);
        expect(String(style.fontFamily)).toMatch(/mono/i);
    });
});
