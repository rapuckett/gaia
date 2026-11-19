// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isConnectAccountPayload, PROVIDER_NAMES } from '@webui/utils/connectAccountCard.core';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { ConnectorRow } from '@/api/client.types';
import { useConnectors } from '@/data';
import { cardSignInScopes } from '@/features/connectors/connectorAccess';
import { ProviderConnect } from '@/features/connectors/ProviderConnect';
import { openSettings } from '@/features/settings/openSettings';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Button, Icon, Notice, Row, Spinner, Stack, Surface, Text } from '@/ui';
import { CircleCheck, Link2, Settings } from '@/ui/icons';

import { UnsupportedCard } from './UnsupportedCard';

/**
 * The desktop's Connect card. An account that signs in with a code, or Google through this phone's browser,
 * starts here and the PC keeps it; any other is connected on the PC. Once one is connected, the chat's banner offers "Ask again".
 */
export function ConnectAccountCard({ data }: { data: unknown }) {
    const t = useT();
    const connectors = useConnectors();
    const [ended, setEnded] = useState<'cancelled' | 'failed' | null>(null);
    const onEnded = useCallback((why: 'cancelled' | 'failed') => setEnded(why), []);
    const onStarted = useCallback(() => setEnded(null), []);
    if (!isConnectAccountPayload(data)) return <UnsupportedCard variant="invalid" render="connect_account" data={data} />;

    const rows = (connectors.data?.connectors ?? []).filter((c): c is ConnectorRow => !('error' in c));
    const rowFor = (id: string) => rows.find((c) => c.id === id);
    const prompt = ended ? t(ended === 'cancelled' ? 'connectCard.cancelled' : 'connectCard.failed') : t('connectCard.prompt');

    return (
        <Surface tone="card" radius="md" border padding="md" testID="card-connect-account">
            <View role="group" aria-label={t('connectCard.label')}>
                <Stack gap="md">
                    <Row gap="sm" align="start">
                        <Icon icon={Link2} size="sm" tone="secondary" />
                        <View style={{ flex: 1 }} role={ended ? 'alert' : undefined}>
                            <Text role="label">{prompt}</Text>
                        </View>
                    </Row>
                    {connectors.error ? <Notice tone="danger" message={describeHttpFailure(connectors.error, t).text} detail={describeHttpFailure(connectors.error, t).detail} /> : null}
                    {connectors.isPending ? <Spinner size="sm" /> : null}
                    {connectors.isPending ? null : data.providers.map((id) => {
                        const row = rowFor(id);
                        return (
                            <ProviderRow
                                key={id}
                                connectorId={id}
                                name={PROVIDER_NAMES[id] ?? row?.display_name ?? id}
                                row={row}
                                scopes={row ? cardSignInScopes(data.scopes?.[id], row) : undefined}
                                onEnded={onEnded}
                                onStarted={onStarted}
                            />
                        );
                    })}
                    <Stack align="start">
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={Settings}
                            wrap
                            label={t('connectCard.settings')}
                            onPress={() => openSettings('connectors')}
                            testID="connect-card-settings"
                        />
                    </Stack>
                </Stack>
            </View>
        </Surface>
    );
}

function ProviderRow({
    connectorId,
    name,
    row,
    scopes,
    onEnded,
    onStarted,
}: {
    connectorId: string;
    name: string;
    row?: ConnectorRow;
    scopes?: string[];
    onEnded(why: 'cancelled' | 'failed'): void;
    onStarted(): void;
}) {
    const t = useT();
    const connected = !!row?.configured;
    // No OAuth client on the PC yet, so sign-in can't start until it is set up.
    if (row && !connected && row.configurable === false) {
        return (
            <Stack gap="sm" testID={`connect-setup-${connectorId}`}>
                <View role="status">
                    <Text role="label" tone="secondary">
                        {t('connectCard.needsSetup', { name })}
                    </Text>
                </View>
                <Stack align="start">
                    <Button size="sm" variant="secondary" wrap label={t('connectCard.setUp', { name })} onPress={() => router.push('/connectors')} />
                </Stack>
            </Stack>
        );
    }
    return (
        <Stack gap="sm">
            {connected ? (
                <View role="status">
                    <Row gap="xs">
                        <Icon icon={CircleCheck} size="sm" tone="success" />
                        <Text role="label" tone="success">
                            {t('connectCard.connected', { name })}
                        </Text>
                    </Row>
                </View>
            ) : null}
            <ProviderConnect
                connectorId={connectorId}
                row={row}
                label={t(connected ? 'connectCard.reconnect' : 'connectCard.connect', { name })}
                scopes={scopes}
                onEnded={onEnded}
                onStarted={onStarted}
            />
        </Stack>
    );
}
