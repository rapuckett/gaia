// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { Button, Screen, ScreenBannerProvider, Stack, Surface, Text, UIProvider } from '@/ui';

import { ApproveOnPcNotice } from './ApproveOnPcNotice';
import { useDevicePrompt, useDevicePromptStore, type DevicePromptKind, type DevicePromptState } from './devicePrompts';

const ACTION = 'sample';

export const APPROVE_STATES: readonly DevicePromptState[] = ['idle', 'waiting', 'approved', 'cancelled', 'denied', 'timeout'];

function SampleCard({ kind }: { kind: DevicePromptKind }) {
    const prompt = useDevicePrompt({ kind, action: ACTION });
    return (
        <Surface tone="card" border padding="md">
            <Stack gap="md">
                <Text role="ui" weight="semibold">
                    Sample action
                </Text>
                {prompt.state === 'approved' ? <Text tone="secondary">Done.</Text> : null}
                {prompt.hideAction ? null : <Button label="Run it" variant="secondary" onPress={prompt.restart} />}
                <ApproveOnPcNotice kind={kind} action={ACTION} onRetry={() => undefined} />
            </Stack>
        </Surface>
    );
}

/** The notice inside a sample card, in one state (`?state=waiting|cancelled|denied|timeout&kind=keyStore|admin`). */
export function ApproveOnPcGallery({ state, kind }: { state: DevicePromptState; kind: DevicePromptKind }) {
    useState(() => {
        useDevicePromptStore.setState({ states: { [`${kind}\u0000${ACTION}`]: state } });
    });
    return (
        <UIProvider>
            <ScreenBannerProvider banner={null}>
                <Screen scroll>
                    <Stack padding="lg">
                        <SampleCard kind={kind} />
                    </Stack>
                </Screen>
            </ScreenBannerProvider>
        </UIProvider>
    );
}
