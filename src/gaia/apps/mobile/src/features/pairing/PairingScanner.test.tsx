// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@webui/i18n/translator';

import { ThemeProvider } from '@/ui';

import { PairingScanner } from './PairingScanner';

const mockUsePermissions = jest.fn();
const mockCameraProps: { current: { onBarcodeScanned: (r: { data: string }) => void } | null } = { current: null };
jest.mock('expo-camera', () => ({
    CameraView: (props: { onBarcodeScanned: (r: { data: string }) => void }) => {
        mockCameraProps.current = props;
        return jest.requireActual('react').createElement('View', { testID: 'camera-view' });
    },
    useCameraPermissions: () => mockUsePermissions(),
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const camera = () => screen.queryAllByTestId('camera-view');

describeNative('PairingScanner permission states', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        mockCameraProps.current = null;
    });

    it('shows a spinner and no camera while the permission is still loading', async () => {
        mockUsePermissions.mockReturnValue([null, jest.fn()]);
        await render(<PairingScanner onCode={jest.fn()} />, { wrapper: wrap });
        expect(JSON.stringify(screen.toJSON())).toContain('ActivityIndicator');
        expect(camera()).toHaveLength(0);
    });

    it('asks first when undetermined, and requests the permission once on press', async () => {
        const requestPermission = jest.fn(async () => undefined);
        mockUsePermissions.mockReturnValue([{ granted: false, canAskAgain: true }, requestPermission]);
        await render(<PairingScanner onCode={jest.fn()} />, { wrapper: wrap });
        expect(screen.getByText(t('mobileApp.pairing.cameraAsk'))).toBeTruthy();
        expect(camera()).toHaveLength(0);
        expect(requestPermission).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByRole('button', { name: t('mobileApp.pairing.cameraAllow') }));
        expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it('shows the camera-off warning when denied, and opens Settings from its action', async () => {
        const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
        mockUsePermissions.mockReturnValue([{ granted: false, canAskAgain: false }, jest.fn()]);
        await render(<PairingScanner onCode={jest.fn()} />, { wrapper: wrap });
        expect(screen.getByText(t('mobileApp.pairing.cameraOff'))).toBeTruthy();
        expect(camera()).toHaveLength(0);
        await fireEvent.press(screen.getByRole('button', { name: t('settings.title') }));
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    it('scans when granted, and reports a repeated code only once', async () => {
        const onCode = jest.fn();
        mockUsePermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
        await render(<PairingScanner onCode={onCode} />, { wrapper: wrap });
        expect(camera()).toHaveLength(1);
        const scan = mockCameraProps.current!.onBarcodeScanned;
        scan({ data: 'gaia://pair/1' });
        scan({ data: 'gaia://pair/1' });
        expect(onCode).toHaveBeenCalledTimes(1);
        expect(onCode).toHaveBeenCalledWith('gaia://pair/1');
        scan({ data: 'gaia://pair/2' });
        expect(onCode).toHaveBeenCalledTimes(2);
    });
});
