// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { openSettings } from './openSettings';
import { SettingsSectionScreen } from './SettingsSectionScreen';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn() },
}));

async function open(params: Record<string, string>) {
    mockParams = params;
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={createFakeClient({})}>
                <ThemeProvider>
                    <SettingsSectionScreen />
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
}

beforeEach(() => jest.clearAllMocks());

(Platform.OS === 'web' ? describe.skip : describe)('SET-NAV-04 jump to a setting, with Back to', () => {
    it('SET-NAV-04: a jump from About into Privacy shows "Back to About", and pressing it replaces the route with About', async () => {
        await open({ section: 'privacy', target: 'report', from: 'about' });
        await fireEvent.press(await screen.findByText('Back to About'));
        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'about' } });
        expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('SET-NAV-04: opening a section directly shows no "Back to"', async () => {
        await open({ section: 'privacy' });
        expect(screen.queryByText(/^Back to /)).toBeNull();
    });

    it('SET-NAV-04: a from that is not a section shows no "Back to"', async () => {
        await open({ section: 'privacy', target: 'report', from: 'nowhere' });
        expect(screen.queryByText(/^Back to /)).toBeNull();
    });

    it.each([
        ['messaging', 'automations', 'Back to Automations'],
        ['model', 'advanced', 'Back to Advanced'],
    ])('SET-NAV-04: a jump into %s from %s with no target still shows "%s", and pressing it replaces to that section', async (section, from, label) => {
        await open({ section, from });
        await fireEvent.press(await screen.findByText(label));
        expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: from } });
    });

    it('SET-NAV-04: a deep link with only a target shows no "Back to"', async () => {
        await open({ section: 'privacy', target: 'report' });
        expect(screen.queryByText(/^Back to /)).toBeNull();
    });

    it('SET-NAV-04: openSettings pushes the section, target and from the screen reads', () => {
        const nav = { push: jest.fn() };
        openSettings('privacy', 'report', 'about', nav);
        expect(nav.push).toHaveBeenCalledWith({ pathname: '/settings/[section]', params: { section: 'privacy', target: 'report', from: 'about' } });
    });
});
