// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import SchedulesGalleryRoute from '@/app/dev/schedules';

import { SCHEDULE_SCENES } from './devScenes';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn(), openDrawer: jest.fn(), toggleDrawer: jest.fn(), getParent: () => undefined }),
}));
// The real provider waits on font files the test environment doesn't have; SheetScope hosts the New schedule sheet.
jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
    const { createElement } = jest.requireActual('react');
    return {
        ...actual,
        UIProvider: ({ children }: { children: unknown }) =>
            createElement(SafeAreaProvider, { initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } } }, createElement(actual.ThemeProvider, null, createElement(actual.SheetScope, null, children))),
    };
});
jest.mock('@/features/dev/devGallery', () => ({ devGalleryEnabled: () => true }));

// react-native-web’s DOM can't be mounted by the component test renderer.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('schedules gallery route', () => {
    it.each(Object.keys(SCHEDULE_SCENES))('renders %s', async (name) => {
        mockState = name;
        await render(<SchedulesGalleryRoute />);
        expect(await screen.findByText('Scheduled tasks')).toBeTruthy();
    });

    it('delete-confirm shows the Confirm? step and keeps it up', async () => {
        mockState = 'delete-confirm';
        await render(<SchedulesGalleryRoute />);
        expect(await screen.findByText('Confirm?')).toBeTruthy();
    });

    it('new-valid previews the weekday schedule it was typed as, not every hour', async () => {
        mockState = 'new-valid';
        await render(<SchedulesGalleryRoute />);
        await waitFor(() => expect(screen.getAllByText(/Weekdays/).length).toBeGreaterThan(1));
        expect(screen.queryByText('Every hour')).toBeNull();
    });

    it('names the scenes when the state is unknown', async () => {
        mockState = 'nope';
        await render(<SchedulesGalleryRoute />);
        expect(screen.getByText('No schedules scene "nope"')).toBeTruthy();
    });
});
