// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { PROVIDER_NAMES } from '@webui/utils/connectAccountCard.core';
import { detectProvider, type EmailProvider } from '@webui/utils/connectorRetry.core';
import { View } from 'react-native';

import type { ConnectorRow } from '@/api/client.types';
import { useConnectors } from '@/data';
import { ProviderConnect } from '@/features/connectors/ProviderConnect';
import { useT } from '@/i18n/useT';
import { Icon, Row, Spinner, Stack, Surface, Text } from '@/ui';
import { CircleAlert } from '@/ui/icons';

const MAILBOXES: readonly EmailProvider[] = ['google', 'microsoft', 'microsoft_work'];

/**
 * The desktop's email connect block on a reply that reports a mailbox sign-in error: Microsoft
 * accounts sign in with a code from here, and Google in this phone's browser (on a paired phone; else on the PC).
 */
export function EmailConnect({ content }: { content: string }) {
    const t = useT();
    const connectors = useConnectors();
    const provider = detectProvider(content);
    const shown = provider === 'all' ? MAILBOXES : [provider];
    const rowFor = (id: string) => (connectors.data?.connectors ?? []).find((c): c is ConnectorRow => c.id === id && !('error' in c));
    return (
        <Surface tone="card" radius="md" border padding="md" testID="email-connect">
            <View role="region" aria-label={t('mobileApp.emailConnect.region')}>
                <Stack gap="md">
                    <Row gap="sm" align="start">
                        <Icon icon={CircleAlert} size="sm" tone="warning" />
                        <Text role="label">{t('mobileApp.emailConnect.prompt')}</Text>
                    </Row>
                    {connectors.isPending ? <Spinner size="sm" /> : null}
                    {connectors.isPending ? null : shown.map((id) => {
                        const name = PROVIDER_NAMES[id];
                        return (
                            <ProviderConnect
                                key={id}
                                connectorId={id}
                                row={rowFor(id)}
                                label={t('connectCard.connect', { name })}
                                againLabel={t('mobileApp.emailConnect.reopen', { name })}
                            />
                        );
                    })}
                </Stack>
            </View>
        </Surface>
    );
}
