// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AgentDownload, AgentProblem, AgentProgram, AgentPrograms } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';

import { AgentRecovery } from './AgentRecovery';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const MISSING: AgentProblem = { code: 'gaiacpp_missing', detail: 'gaiacpp is chosen as the agent but it is not installed on this PC.' };
const PY: AgentProgram = { id: 'gaiapy', installed: true, size_bytes: null, can_download: false, unavailable_reason: null };
const CPP: AgentProgram = { id: 'gaiacpp', installed: false, size_bytes: 9_400_000, can_download: true, unavailable_reason: null };
const IDLE: AgentDownload = { state: 'idle', bytes_done: 0, bytes_total: null, error: null };
const listing = (download: AgentDownload = IDLE): AgentPrograms => ({ current: 'gaiacpp', programs: [PY, CPP], download });

const mount = async (props: { kept?: boolean; download?: AgentDownload } = {}) => {
    const client = createFakeClient({ agentPrograms: listing(props.download) });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<AgentRecovery problem={MISSING} answeredAt={1} onRetry={jest.fn()} kept={props.kept} />, { wrapper });
    await screen.findByTestId(props.download ? 'agent-download-row' : 'agent-recovery-download');
};

describeNative('AgentRecovery accessibility', () => {
    afterEach(() => jest.restoreAllMocks());

    it('names both ways out in full, with a role and a 44 pt target', async () => {
        await mount();
        const list = touchables();
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
        expect(list.find((x) => x.testID === 'agent-recovery-use-python')?.name).toBe(t('newChat.agent.usePython'));
        expect(list.find((x) => x.testID === 'agent-recovery-download')?.name).toMatch(/gaiacpp/);
    });

    it('reads the problem as an alert before the buttons, and Details last', async () => {
        await mount();
        const order = walk();
        const alert = order.findIndex((n) => n.props.accessibilityRole === 'alert');
        const download = order.findIndex((n) => n.props.testID === 'agent-recovery-download');
        const python = order.findIndex((n) => n.props.testID === 'agent-recovery-use-python');
        const details = order.findIndex((n) => n.props.testID === 'agent-recovery-details');
        expect(alert).toBeGreaterThanOrEqual(0);
        expect(alert).toBeLessThan(download);
        expect(download).toBeLessThan(python);
        expect(python).toBeLessThan(details);
    });

    it('the Details disclosure exposes expanded and flips it', async () => {
        await mount();
        const details = () => touchables().find((x) => x.testID === 'agent-recovery-details');
        expect(details()?.expanded).toBe(false);
        await fireEvent.press(screen.getByTestId('agent-recovery-details'));
        expect(details()?.expanded).toBe(true);
    });

    it('the kept line is a polite live region, and iOS also announces it', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        await mount({ kept: true });
        const live = walk().find((n) => n.props.accessibilityLiveRegion === 'polite');
        expect(live).toBeTruthy();
        expect(JSON.stringify(live)).toContain(t('newChat.agent.kept'));
        if (Platform.OS === 'ios') expect(announce).toHaveBeenCalledWith(t('newChat.agent.kept'));
    });

    it('no kept line, no live region to chatter', async () => {
        await mount();
        expect(walk().some((n) => n.props.accessibilityLiveRegion === 'polite')).toBe(false);
    });

    it('while the download runs both buttons are disabled and the bar carries its value', async () => {
        await mount({ download: { state: 'downloading', bytes_done: 40, bytes_total: 100, error: null } });
        expect(touchables().find((x) => x.testID === 'agent-recovery-use-python')?.disabled).toBe(true);
        expect(walk().find((n) => n.props.accessibilityRole === 'progressbar')?.props.accessibilityValue).toMatchObject({ now: 40 });
    });

    it('"Starting the agent" is read once: no spinner label, a polite live region, one iOS announcement', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        announce.mockClear();
        await mount();
        await fireEvent.press(screen.getByTestId('agent-recovery-use-python'));
        const text = await screen.findByText(t('newChat.agent.starting'));
        expect(text).toBeTruthy();
        const nodes = walk();
        expect(nodes.some((n) => n.props.accessibilityRole === 'progressbar')).toBe(false);
        const live = nodes.find((n) => n.props.accessibilityLiveRegion === 'polite');
        expect(JSON.stringify(live)).toContain(t('newChat.agent.starting'));
        expect(announce.mock.calls.filter((c) => c[0] === t('newChat.agent.starting'))).toHaveLength(Platform.OS === 'ios' ? 1 : 0);
    });
});
