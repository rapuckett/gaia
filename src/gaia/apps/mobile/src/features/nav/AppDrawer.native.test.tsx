// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { ThemeProvider } from '@/ui';

import { AppDrawer } from './AppDrawer';

jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => 'closed' }));
jest.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/features/chats/ChatDrawerContent', () => ({ ChatDrawerContent: () => null }));

function mount(width: number, navigation: { closeDrawer: jest.Mock }) {
    Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
    const props = { navigation, state: { routeNames: [] } } as unknown as ComponentProps<typeof AppDrawer>;
    const ui = (
        <QueryClientProvider client={new QueryClient()}>
            <ThemeProvider>
                <AppDrawer {...props} />
            </ThemeProvider>
        </QueryClientProvider>
    );
    return render(ui);
}

describe('AppDrawer rotation', () => {
    it('closes an open overlay when a rotation makes the drawer permanent', async () => {
        const navigation = { closeDrawer: jest.fn() };
        await mount(768, navigation);
        expect(navigation.closeDrawer).not.toHaveBeenCalled();
        await act(async () => Dimensions.set({ window: { width: 1024, height: 768, scale: 2, fontScale: 1 } }));
        expect(navigation.closeDrawer).toHaveBeenCalledTimes(1);
    });

    it('marks the sidebar container for audits', async () => {
        const { getByTestId } = await mount(1024, { closeDrawer: jest.fn() });
        expect(getByTestId('app-sidebar')).toBeTruthy();
    });

    it('draws our themed divider on the inline-end edge whenever the sidebar is permanent, and none on the overlay', async () => {
        const permanent = await mount(1024, { closeDrawer: jest.fn() });
        const style = StyleSheet.flatten(permanent.getByTestId('app-sidebar').props.style);
        expect(style.borderEndWidth).toBe(StyleSheet.hairlineWidth);
        expect(style.borderEndColor).toBeTruthy();
        expect(style.borderStartWidth).toBeUndefined();
        await permanent.unmount();
        const overlay = await mount(768, { closeDrawer: jest.fn() });
        expect(StyleSheet.flatten(overlay.getByTestId('app-sidebar').props.style).borderEndWidth).toBeUndefined();
    });
});
