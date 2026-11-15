// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect } from 'expo-router';

import { DeviceCodeBlock } from '@/features/connectors/DeviceCodeSignIn';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { Screen, Stack, Text, UIProvider } from '@/ui';

const CODE = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5, message: '' };

export default function ConnectCodeGalleryRoute() {
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    return (
        <UIProvider>
            <Screen scroll>
                <Stack gap="xl" padding="lg">
                    <Stack gap="sm">
                        <Text role="caption" tone="muted">{'Waiting for sign-in'}</Text>
                        <DeviceCodeBlock code={CODE} />
                    </Stack>
                    <Stack gap="sm">
                        <Text role="caption" tone="muted">{'Sign-in page that is not https'}</Text>
                        <DeviceCodeBlock code={{ ...CODE, verification_uri: 'http://example.com/devicelogin' }} />
                    </Stack>
                </Stack>
            </Screen>
        </UIProvider>
    );
}
