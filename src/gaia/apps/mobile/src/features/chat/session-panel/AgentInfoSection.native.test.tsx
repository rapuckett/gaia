// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AgentCapabilities } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AgentInfoSection } from './AgentInfoSection';
import { useSessionPanelStore } from './panelStore';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const TOOL = { name: 'read_file', description: 'Reads a file.', category: 'file_io' };
const caps = (program: AgentCapabilities['program'], tools = [TOOL]): AgentCapabilities => ({ session_id: 's1', agent_type: 'gaia', tools, program });

async function mount(capabilities: AgentCapabilities) {
    const client = createFakeClient({ capabilities: { s1: capabilities } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<AgentInfoSection sessionId="s1" live={false} />, { wrapper: wrap });
}

describeNative('the agent info section', () => {
    beforeEach(() => useSessionPanelStore.setState((s) => ({ sections: { ...s.sections, tools: true } })));

    it.each([
        ['with tools', [TOOL], /read_file/],
        ['with no tools', [], new RegExp(t('tools.empty'))],
    ])('says gaiacpp runs it, tagged Beta, %s', async (_label, tools, shown) => {
        await mount(caps('gaiacpp', tools));
        expect(await screen.findByText(shown)).toBeTruthy();
        expect(screen.getByText(/Runs on .?gaiacpp/)).toBeTruthy();
        expect(screen.getByText(t.bare('setup.agent.beta'))).toBeTruthy();
    });

    it('says nothing of the program for gaiapy', async () => {
        await mount(caps('gaiapy'));
        expect(await screen.findByText(/read_file/)).toBeTruthy();
        expect(screen.queryByText(/Runs on/)).toBeNull();
    });
});
