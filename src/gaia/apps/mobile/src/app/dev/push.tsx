// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { PushExplainer } from '@/features/push/PushExplainer';
import { PushSettingsRowView } from '@/features/push/PushSettingsRow';
import type { PushRowState } from '@/features/push/pushStore';
import { Screen, Stack, Text, UIProvider } from '@/ui';

const STATES: PushRowState[] = ['not_asked', 'on', 'blocked', 'unreachable', 'unavailable'];

/** Push's phone screens on no PC: `?only=explainer` opens the explainer sheet, `?only=<row state>` shows one Settings row, none shows every row state. */
export default function PushGalleryRoute() {
    const { only } = useLocalSearchParams<{ only?: string }>();
    const [last, setLast] = useState('none');
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const shown = STATES.filter((s) => !only || s === only);
    return (
        <UIProvider>
            <Screen scroll>
                <Stack gap="lg" padding="lg">
                    <Text role="caption" tone="muted">{`Last tap: ${last}`}</Text>
                    {only === 'explainer'
                        ? null
                        : shown.map((state) => (
                              <Stack key={state} gap="xs">
                                  <Text role="caption" tone="muted">
                                      {state}
                                  </Text>
                                  <PushSettingsRowView state={state} onTurnOn={() => setLast(`${state}: turn on`)} onOpenSettings={() => setLast(`${state}: open settings`)} />
                              </Stack>
                          ))}
                </Stack>
            </Screen>
            <PushExplainer open={only === 'explainer'} onAllow={() => setLast('allow')} onLater={() => setLast('later')} />
        </UIProvider>
    );
}
