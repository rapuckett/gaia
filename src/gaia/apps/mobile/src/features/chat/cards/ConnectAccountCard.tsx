// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { awaited, isConnectAccountPayload } from '@webui/utils/connectAccountCard.core';

import type { ConnectorRow } from '@/api/client.types';
import { useConnectors } from '@/data';
import { DeviceCodeSignIn } from '@/features/connectors/DeviceCodeSignIn';
import { useT } from '@/i18n/useT';
import { Icon, Row, Stack, Surface, Text } from '@/ui';
import { Link2 } from '@/ui/icons';

import { UnsupportedCard } from './UnsupportedCard';

/** An account that signs in with a code starts here, and the PC keeps it; any other is connected on the PC. The chat offers "Ask again" once it's done. */
export function ConnectAccountCard({ data }: { data: unknown }) {
    const t = useT();
    const connectors = useConnectors();
    if (!isConnectAccountPayload(data)) return <UnsupportedCard variant="invalid" render="connect_account" data={data} />;
    const waiting = new Set(awaited(data));
    const byCode = (connectors.data?.connectors ?? []).filter(
        (c): c is ConnectorRow => waiting.has(c.id) && !('error' in c) && c.supports_device_code === true,
    );
    const onPc = data.providers.length > byCode.length;
    return (
        <Surface tone="card" radius="md" border padding="md" testID="card-connect-account">
            <Stack gap="sm">
                <Row gap="sm" align="center">
                    <Icon icon={Link2} size="sm" tone="accent" />
                    <Stack flex={1}>
                        <Text role="label">{t('connectCard.prompt')}</Text>
                    </Stack>
                </Row>
                {byCode.map((c) => (
                    <DeviceCodeSignIn
                        key={c.id}
                        connector={c}
                        startLabel={t('mobileApp.connectCard.signInWithCode', { name: c.display_name })}
                        doneMessage={t('connectCard.askAgain')}
                    />
                ))}
                {onPc ? (
                    <Text role="caption" tone="secondary">
                        {t('mobileApp.connectCard.onPc')}
                    </Text>
                ) : null}
            </Stack>
        </Surface>
    );
}
