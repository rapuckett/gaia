// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { SkillsBody } from './SkillsScreen';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Skills "How this works"', () => {
    it('is a disclosure that says whether it is open', async () => {
        await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={createFakeClient({})}>
                    <ThemeProvider>
                        <SkillsBody onTry={() => undefined} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        const toggle = screen.getByLabelText(translator('en')('settings.model.howItWorks'));
        expect(toggle.props.accessibilityState?.expanded ?? toggle.props['aria-expanded']).toBe(false);
    });
});
