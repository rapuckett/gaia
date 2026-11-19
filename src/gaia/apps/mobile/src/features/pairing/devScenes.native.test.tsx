// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';

import { PAIRING_SCENES, PairingSceneView } from './devScenes';
import { setPairingService } from './registry';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

jest.mock('expo-router', () => ({
    useNavigation: () => ({ openDrawer: jest.fn(), goBack: jest.fn(), canGoBack: () => false }),
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// The web project's renderer can't mount react-native-web's DOM.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const t = translator('en');
const EXPECTED: Record<string, string> = {
    'route-home': t('mobileApp.pairing.route.home'),
    'route-tailnet': t('mobileApp.pairing.route.tailnet'),
    'route-tailnet-long-name': t('mobileApp.pairing.route.tailnet'),
    'two-pcs-same-host': t('mobileApp.pairing.pcs.use'),
    'unreachable-away': t('mobileApp.pairing.unreachable.away'),
    'changes-loading': t('mobileApp.devices.changesTitle'),
    'changes-empty': t('settings.devices.changesNone'),
    'changes-few': t('settings.devices.change.localOnlyOff'),
    'changes-many': t('settings.devices.changesShowAll'),
    'changes-all': t('settings.devices.changesShowAll'),
    'changes-wave1': t('settings.devices.change.pairingClosed'),
    'changes-wave6': t('settings.devices.change.permissionsDefaultAsk'),
    'changes-error': 'The PC could not read its audit log.',
    'changes-unknown-kind': 'cameraEnabled',
};

describeNative('pairing dev scenes', () => {
    afterEach(() => setPairingService(null));
    it.each(Object.keys(PAIRING_SCENES))('renders %s', async (name) => {
        await render(
            <SafeAreaProvider initialMetrics={METRICS}>
                <PairingSceneView scene={PAIRING_SCENES[name]} />
            </SafeAreaProvider>,
        );
        expect((await screen.findAllByText(EXPECTED[name], { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });
});
