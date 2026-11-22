// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Linking } from 'react-native';

import { useT } from '@/i18n/useT';
import { Button, Card, Notice, Stack, Text } from '@/ui';

import { pushAvailable } from './pushConfig';
import { pushRowState, usePushStore, type PushRowState } from './pushStore';

export interface PushSettingsRowViewProps {
    state: PushRowState;
    onTurnOn: () => void;
    onOpenSettings: () => void;
}

/** "Notifications on this phone", in its four states, plus a build that has no push. */
export function PushSettingsRowView({ state, onTurnOn, onOpenSettings }: PushSettingsRowViewProps) {
    const t = useT();
    return (
        <Card testID={`push-row-${state}`}>
            <Stack gap="sm">
                <Text role="ui" weight="semibold" accessibilityRole="header">
                    {t('mobileApp.push.row.title')}
                </Text>
                {state === 'unreachable' ? (
                    <Notice tone="warning" message={t('mobileApp.push.row.unreachable')} />
                ) : (
                    <Text role="label" tone="secondary">
                        {t(
                            state === 'unavailable'
                                ? 'mobileApp.push.row.unavailable'
                                : state === 'on'
                                  ? 'mobileApp.push.row.on'
                                  : state === 'blocked'
                                    ? 'mobileApp.push.row.blocked'
                                    : 'mobileApp.push.row.off',
                        )}
                    </Text>
                )}
                {state === 'not_asked' ? (
                    <Button variant="primary" label={t('mobileApp.push.ask.allow')} onPress={onTurnOn} testID="push-row-turn-on" />
                ) : null}
                {state === 'blocked' ? (
                    <Button label={t('mobileApp.push.row.openSettings')} onPress={onOpenSettings} testID="push-row-open-settings" />
                ) : null}
            </Stack>
        </Card>
    );
}

export function PushSettingsRow() {
    const permission = usePushStore((s) => s.permission);
    const relay = usePushStore((s) => s.relay);
    const openExplainer = usePushStore((s) => s.openExplainer);
    return (
        <PushSettingsRowView
            state={pushRowState(pushAvailable(), permission, relay)}
            onTurnOn={() => openExplainer(false)}
            onOpenSettings={() => {
                Linking.openSettings().catch((error: unknown) => console.error("Couldn't open this app's page in the phone's Settings", error));
            }}
        />
    );
}
