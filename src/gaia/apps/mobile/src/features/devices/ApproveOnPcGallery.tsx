// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { Button, Screen, ScreenBannerProvider, Stack, Surface, Text, UIProvider } from '@/ui';

import { ApproveOnPcNotice } from './ApproveOnPcNotice';
import { seedDevicePrompt, useDevicePrompt, type DevicePromptKind, type DevicePromptNote, type DevicePromptState } from './devicePrompts';

const ACTION = 'sample';

export const APPROVE_STATES: readonly DevicePromptState[] = ['idle', 'waiting', 'approved', 'cancelled', 'denied', 'timeout', 'failed', 'busy', 'tooSoon'];

/** What the PC's reason or wait would be for a state that carries one. */
const NOTES: Partial<Record<DevicePromptState, DevicePromptNote>> = {
    failed: { detail: 'GAIA could not write the setting. Check the PC for details.' },
};

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

/** The notice inside a sample card, in one state (`?state=waiting|cancelled|denied|timeout|failed|busy|tooSoon&kind=keyStore|admin`). */
export function ApproveOnPcGallery({ state, kind }: { state: DevicePromptState; kind: DevicePromptKind }) {
    useState(() => {
        seedDevicePrompt(kind, ACTION, state, NOTES[state]);
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
