// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import { accountRef, accountsOf, middleCut, needsSignIn } from '@webui/utils/connectorAccounts';
import { useState } from 'react';
import { View } from 'react-native';

import type { ConnectorAccount, ConnectorRow } from '@/api/client.types';
import { useChangeConnectorAccount } from '@/data';
import { ChipButton } from '@/features/schedules/ChipButton';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { ActionSheet, Button, Icon, Ltr, Notice, Row, Stack, Surface, Text, useTheme } from '@/ui';
import { CircleAlert, CircleCheck, Trash2 } from '@/ui/icons';

import { ProviderConnect } from './ProviderConnect';

const addressOf = (a: ConnectorAccount) => a.email || a.account_id;

/** One account's state: working, or the sign-in that stopped. */
export function AccountStatus({ account }: { account: ConnectorAccount }) {
    const t = useT();
    if (account.status === 'ok') {
        return (
            <Row gap="xs">
                <Icon icon={CircleCheck} size="sm" tone="success" />
                <Text role="label" tone="success">{t('settings.connectors.connected')}</Text>
            </Row>
        );
    }
    return (
        <Row gap="xs">
            <Icon icon={CircleAlert} size="sm" tone="danger" />
            <Text role="label" tone="danger">{t(account.status === 'reauth_required' ? 'settings.connectors.signInExpired' : 'settings.connectors.notWorking')}</Text>
        </Row>
    );
}

function DefaultPill() {
    const t = useT();
    const { colors, radius } = useTheme();
    return (
        <View style={{ backgroundColor: colors.bgTertiary, borderColor: colors.borderLight, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 1 }}>
            <Text role="caption" tone="muted" numberOfLines={1}>{t('settings.connectors.default')}</Text>
        </View>
    );
}

/** Each signed-in account of an OAuth connector, with its own Reconnect, default choice and Disconnect. */
export function ConnectorAccountList({ connector }: { connector: ConnectorRow }) {
    const t = useT();
    const accounts = accountsOf(connector);
    const name = connector.display_name;
    const change = useChangeConnectorAccount(connector.id);
    const [asking, setAsking] = useState<ConnectorAccount | null>(null);
    const [failure, setFailure] = useState<{ text: string; detail?: string } | 'pcOnly' | null>(null);

    function run(kind: 'default' | 'disconnect', account: ConnectorAccount) {
        setFailure(null);
        change.mutate(
            { kind, accountId: accountRef(account) },
            { onError: (e) => setFailure(isPcRefusal(e) ? 'pcOnly' : describeHttpFailure(e, t)) },
        );
    }

    return (
        <Stack gap="sm">
            <Stack gap="sm" accessibilityRole="list" accessibilityLabel={t('settings.connectors.accountList', { name })} testID={`connector-accounts-${connector.id}`}>
                {accounts.map((account, i) => {
                    const ref = accountRef(account);
                    const address = { address: isolate(addressOf(account), 'ltr') };
                    return (
                        <Surface key={ref === 'default' ? `default:${i}` : ref} tone="secondary" border radius="md" padding="md" testID={`connector-account-${ref}`}>
                            <Stack gap="sm">
                                <Row gap="sm" wrap>
                                    <View style={{ flexShrink: 1, minWidth: 0 }}>
                                        <Text role="label" weight="semibold" numberOfLines={1} largeLines={1} ellipsize="middle" accessibilityLabel={addressOf(account)}>
                                            <Ltr>{middleCut(addressOf(account))}</Ltr>
                                        </Text>
                                    </View>
                                    {account.is_default && accounts.length > 1 ? <DefaultPill /> : null}
                                </Row>
                                <AccountStatus account={account} />
                                <Row gap="sm" wrap>
                                    {needsSignIn(account) ? (
                                        <ProviderConnect
                                            connectorId={connector.id}
                                            row={connector}
                                            label={t('settings.connectors.reconnect')}
                                            accessibilityLabel={t('settings.connectors.reconnectNamed', address)}
                                            target={{ account: ref }}
                                            testID={`connector-reconnect-${ref}`}
                                            secondary
                                        />
                                    ) : null}
                                    {!account.is_default && account.status === 'ok' ? (
                                        <ChipButton
                                            label={t.bare('settings.connectors.makeDefault')}
                                            accessibilityLabel={t('settings.connectors.makeDefaultNamed', address)}
                                            disabled={change.isPending}
                                            onPress={() => run('default', account)}
                                            testID={`connector-make-default-${ref}`}
                                        />
                                    ) : null}
                                    <Button
                                        size="sm"
                                        label={t('settings.connectors.disconnect')}
                                        accessibilityLabel={t('settings.connectors.disconnectNamed', address)}
                                        variant="danger"
                                        disabled={change.isPending}
                                        onPress={() => setAsking(account)}
                                        testID={`connector-disconnect-account-${ref}`}
                                    />
                                </Row>
                            </Stack>
                        </Surface>
                    );
                })}
            </Stack>
            {accounts.length > 1 ? <Text role="caption" tone="muted">{t('settings.connectors.defaultHint')}</Text> : null}
            {failure === 'pcOnly' ? <PcOnlyNotice testID="connector-account-pc-only" /> : null}
            {failure && failure !== 'pcOnly' ? <Notice tone="danger" message={failure.text} detail={failure.detail} testID="connector-account-failed" /> : null}
            <ActionSheet
                open={!!asking}
                onClose={() => setAsking(null)}
                title={asking ? t('settings.connectors.disconnectAccountAsk', { address: isolate(addressOf(asking), 'ltr') }) : undefined}
                message={t(accounts.length > 1 ? 'settings.connectors.disconnectAccountOthers' : 'settings.connectors.disconnectAccountLast', { name })}
                actions={[
                    {
                        label: t('settings.connectors.disconnect'),
                        icon: Trash2,
                        destructive: true,
                        testID: 'connector-disconnect-account-confirm',
                        onPress: () => asking && run('disconnect', asking),
                    },
                ]}
            />
        </Stack>
    );
}

/** Another account of an OAuth connector; the PC keeps it, and the first stays the default. */
export function AddAccount({ connector }: { connector: ConnectorRow }) {
    const t = useT();
    return (
        <ProviderConnect
            connectorId={connector.id}
            row={connector}
            label={t('settings.connectors.addAccount', { name: connector.display_name })}
            target={{ addAccount: true }}
            testID={`connector-add-account-${connector.id}`}
        />
    );
}
