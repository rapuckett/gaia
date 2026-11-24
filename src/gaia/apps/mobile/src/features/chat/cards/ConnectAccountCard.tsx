// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { PROVIDER_NAMES } from '@webui/utils/connectAccountCard.core';
import { isConnectAccountPayload } from '@webui/utils/connectCards';
import { isolate } from '@webui/i18n/registry';
import { accountRef, accountsOf, addedBesideDefault, middleCut, reconnectOffer, signInFixed, type ConnectOffer } from '@webui/utils/connectorAccounts';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { ConnectorAccount, ConnectorRow } from '@/api/client.types';
import { useConnectors } from '@/data';
import { cardSignInScopes } from '@/features/connectors/connectorAccess';
import { ProviderConnect } from '@/features/connectors/ProviderConnect';
import { openSettings } from '@/features/settings/openSettings';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { useAnnounce } from '@/platform/useAnnounce';
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
    // The connectors as this card first saw them: only a change since counts as the fix.
    const [before, setBefore] = useState<ConnectorRow[] | null>(null);
    if (!before && connectors.data) setBefore(connectors.data.connectors.filter((c): c is ConnectorRow => !('error' in c)));
    const onEnded = useCallback((why: 'cancelled' | 'failed') => setEnded(why), []);
    const onStarted = useCallback(() => setEnded(null), []);
    useAnnounce(ended === 'cancelled' ? t('connectCard.cancelled') : null);
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
                        {/* An unfinished sign-in is news, not an error: Android reads the change politely, iOS hears useAnnounce. The region is always there, so Android sees the change. */}
                        <View style={{ flex: 1 }} role={ended === 'failed' ? 'alert' : undefined} accessibilityLiveRegion="polite">
                            <Text role="label" tone={ended === 'cancelled' ? 'muted' : undefined} testID={ended === 'cancelled' ? 'connect-card-cancelled' : undefined}>
                                {prompt}
                            </Text>
                        </View>
                    </Row>
                    {connectors.error ? <Notice tone="danger" message={describeHttpFailure(connectors.error, t).text} detail={describeHttpFailure(connectors.error, t).detail} /> : null}
                    {connectors.isPending ? <Spinner size="sm" /> : null}
                    {connectors.isPending ? null : data.providers.map((id) => {
                        const row = rowFor(id);
                        const named = data.account?.[id];
                        const earlier = before?.find((c) => c.id === id);
                        const fixed = before !== null && signInFixed(row, earlier, named);
                        return (
                            <ProviderRow
                                key={id}
                                connectorId={id}
                                name={PROVIDER_NAMES[id] ?? row?.display_name ?? id}
                                row={row}
                                offer={reconnectOffer(row, named)}
                                // With several accounts, a working one says nothing about the one that failed.
                                saysConnected={fixed || (!!row?.configured && accountsOf(row).length <= 1)}
                                added={fixed ? addedBesideDefault(row, earlier) : null}
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
    offer,
    saysConnected,
    added,
    scopes,
    onEnded,
    onStarted,
}: {
    connectorId: string;
    name: string;
    row?: ConnectorRow;
    offer: ConnectOffer;
    /** Say the provider is connected: never while the account that failed may still be broken. */
    saysConnected: boolean;
    /** The account just signed in beside the default, which GAIA uses only when asked. */
    added: ConnectorAccount | null;
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
    const { account } = offer;
    const address = (a: ConnectorAccount) => isolate(middleCut(a.email || a.account_id), 'ltr');
    return (
        <Stack gap="sm">
            {saysConnected && !account ? (
                <View role="status">
                    <Row gap="xs">
                        <Icon icon={CircleCheck} size="sm" tone="success" />
                        <Text role="label" tone="success">
                            {added ? t('connectCard.addedAccount', { address: address(added), name }) : t('connectCard.connected', { name })}
                        </Text>
                    </Row>
                </View>
            ) : null}
            {account ? (
                <ProviderConnect
                    connectorId={connectorId}
                    row={row}
                    label={t('connectCard.reconnectAccount', { address: address(account) })}
                    scopes={scopes}
                    target={{ account: accountRef(account) }}
                    testID={`connect-reconnect-${connectorId}`}
                    onEnded={onEnded}
                    onStarted={onStarted}
                />
            ) : (
                <ProviderConnect
                    connectorId={connectorId}
                    row={row}
                    label={t(connected ? 'connectCard.reconnect' : 'connectCard.connect', { name })}
                    scopes={scopes}
                    onEnded={onEnded}
                    onStarted={onStarted}
                />
            )}
            {offer.otherAccount ? (
                <ProviderConnect
                    connectorId={connectorId}
                    row={row}
                    label={t('connectCard.otherAccount')}
                    scopes={scopes}
                    target={{ addAccount: true }}
                    testID={`connect-other-${connectorId}`}
                    secondary
                    onEnded={onEnded}
                    onStarted={onStarted}
                />
            ) : null}
        </Stack>
    );
}
