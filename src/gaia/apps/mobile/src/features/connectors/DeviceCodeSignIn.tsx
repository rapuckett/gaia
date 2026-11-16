// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import { useState, type ReactNode } from 'react';

import type { ConnectorDeviceAuthResponse, ConnectorRow } from '@/api/client.types';
import { useDeviceSignIn } from '@/data';
import { ChipButton } from '@/features/schedules/ChipButton';
import { describeError, useT } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import { Button, Ltr, Notice, Row, Spinner, Stack, Surface, Text } from '@/ui';
import { Check, Copy, ExternalLink } from '@/ui/icons';

const HTTPS = /^https:\/\//i;

/** The desktop's "Sign in with a code" (`.device-code-block`): the PC asks for a code, the person enters it at the provider's page, and the PC keeps the account. */
export function DeviceCodeSignIn({
    connector,
    startLabel,
    doneMessage,
    leading,
}: {
    connector: ConnectorRow;
    startLabel?: string;
    doneMessage?: string;
    /** Shown before the start button until a code arrives, as the desktop's Connect beside "Sign in with a code". */
    leading?: ReactNode;
}) {
    const t = useT();
    const { signIn, start } = useDeviceSignIn(connector);
    const label = startLabel ?? t.bare('settings.connectors.code');

    if (doneMessage && (signIn.state === 'done' || connector.configured)) return <Notice tone="success" message={doneMessage} />;
    switch (signIn.state) {
        case 'waiting':
            return <DeviceCodeBlock code={signIn.code} />;
        case 'done':
            return null;
        default:
            return (
                <Stack gap="sm">
                    <Row gap="sm" wrap>
                        {leading}
                        <ChipButton
                            label={label}
                            accessibilityLabel={startLabel ?? t('settings.connectors.code')}
                            disabled={signIn.state === 'starting'}
                            onPress={start}
                            testID={`device-sign-in-${connector.id}`}
                        />
                    </Row>
                    {signIn.state === 'starting' ? <Spinner size="sm" /> : null}
                    {signIn.state === 'expired' ? <Notice tone="danger" message={t('mobileApp.connectors.codeExpired')} /> : null}
                    {signIn.state === 'failed' ? <Notice tone="danger" message={describeError(signIn.error, t)} /> : null}
                </Stack>
            );
    }
}

function DeviceCodeBlock({ code }: { code: ConnectorDeviceAuthResponse }) {
    const t = useT();
    const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
    const copy = () => Clipboard.setStringAsync(code.user_code).then(() => setCopied('ok'), () => setCopied('failed'));
    const https = HTTPS.test(code.verification_uri);
    return (
        <Surface tone="secondary" border radius="md" padding="md" testID="device-code-block">
            <Stack gap="sm">
                <Text role="label">
                    {t('settings.connectors.goTo')} <Ltr>{code.verification_uri}</Ltr>
                </Text>
                <Row>
                    <Surface tone="recessed" border radius="md" padding="sm">
                        <Text role="title" mono weight="semibold" selectable testID="device-code-value">
                            <Ltr>{code.user_code}</Ltr>
                        </Text>
                    </Surface>
                </Row>
                <Row gap="sm" wrap>
                    <Button
                        size="sm"
                        icon={copied === 'ok' ? Check : Copy}
                        label={t.bare(copied === 'ok' ? 'settings.messaging.copied' : 'settings.messaging.copy')}
                        accessibilityLabel={t(copied === 'ok' ? 'settings.messaging.copied' : 'settings.messaging.copy')}
                        onPress={() => void copy()}
                    />
                    {https ? (
                        <Button
                            size="sm"
                            icon={ExternalLink}
                            label={t.bare('mobileApp.connectors.codeOpen')}
                            accessibilityLabel={t('mobileApp.connectors.codeOpen')}
                            onPress={() => openLinkFromPress(code.verification_uri)}
                        />
                    ) : null}
                </Row>
                {copied === 'failed' ? <Notice tone="danger" message={t('settings.messaging.copyFailed')} /> : null}
                {!https ? <Notice tone="danger" message={t('mobileApp.connectors.codeNotHttps')} /> : null}
                <Row gap="sm">
                    <Spinner size="sm" />
                    <Text role="label" tone="muted">{t('settings.connectors.waiting')}</Text>
                </Row>
                <Text role="caption" tone="muted">{t('mobileApp.connectors.codeHint')}</Text>
            </Stack>
        </Surface>
    );
}
