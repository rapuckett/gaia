// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import type { ConnectorRow } from '@/api/client.types';
import { ChipButton } from '@/features/schedules/ChipButton';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Button, Notice, Row, Spinner, Stack, Surface, Text } from '@/ui';

import { useBrowserSignIn, type BrowserSignIn } from './browserSignIn';

type Failed = Extract<BrowserSignIn, { state: 'failed' }>;

/** Why a browser sign-in stopped: our sentence, with the PC's or provider's own words on the detail line. */
export function browserSignInNotice(failed: Failed, name: string, t: ReturnType<typeof useT>): { message: string; detail?: string } {
    const detail = failed.detail;
    switch (failed.reason) {
        case 'denied':
            return { message: t('mobileApp.connectors.browserDenied', { name }) };
        case 'closed':
            return { message: t('connectCard.cancelled') };
        case 'timeout':
            return { message: t('mobileApp.connectors.browserTimeout') };
        case 'listenerLost':
            return { message: t('mobileApp.connectors.browserListenerLost') };
        case 'superseded':
            return { message: t('mobileApp.connectors.browserSuperseded') };
        case 'expired':
            return { message: t('mobileApp.connectors.browserExpired'), detail };
        case 'stateMismatch':
            return { message: t('mobileApp.connectors.browserStateMismatch'), detail };
        case 'rejected':
            return { message: t('mobileApp.connectors.browserRejected'), detail };
        case 'refused':
            return { message: t('mobileApp.connectors.browserRefused', { name }), detail };
        case 'mismatch':
            return { message: t('mobileApp.connectors.browserMismatch') };
        case 'notHttps':
            return { message: t('mobileApp.connectors.codeNotHttps') };
        case 'unavailable':
            return { message: t('mobileApp.connectors.browserUnavailable') };
        case 'error': {
            const { text, detail: raw } = describeHttpFailure(failed.error, t);
            return { message: text, detail: raw };
        }
    }
}

/** The wait while the browser is open on this phone or the PC finishes the sign-in. */
export function BrowserSignInWaiting({ state, name, onCancel }: { state: 'browser' | 'finishing'; name: string; onCancel(): void }) {
    const t = useT();
    return (
        <Surface tone="secondary" border radius="md" padding="md" testID="browser-sign-in-block">
            <Stack gap="sm">
                <View accessibilityLiveRegion="polite">
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Text role="label" tone="secondary">
                            {state === 'browser' ? t('mobileApp.connectors.browserWaiting', { name }) : t('mobileApp.connectors.browserFinishing')}
                        </Text>
                    </Row>
                </View>
                <Text role="caption" tone="muted">{t('mobileApp.connectors.browserHint')}</Text>
                {state === 'browser' ? (
                    <Row gap="sm" wrap>
                        <Button
                            size="sm"
                            label={t.bare('settings.key.cancel')}
                            accessibilityLabel={t('settings.key.cancel')}
                            onPress={onCancel}
                            testID="browser-sign-in-cancel"
                        />
                    </Row>
                ) : null}
            </Stack>
        </Surface>
    );
}

/** Connect for a connector whose sign-in runs in a browser (Google): the browser opens on this phone, and the PC finishes the sign-in and keeps the account. */
export function BrowserSignInBlock({ connector }: { connector: ConnectorRow }) {
    const t = useT();
    const { signIn, start, cancel } = useBrowserSignIn(connector);
    const name = connector.display_name;

    if (signIn.state === 'done') return null;
    if (signIn.state === 'browser' || signIn.state === 'finishing') return <BrowserSignInWaiting state={signIn.state} name={name} onCancel={cancel} />;
    return (
        <Stack gap="sm">
            <Row gap="sm" wrap>
                <ChipButton
                    label={t.bare('settings.key.connect')}
                    accessibilityLabel={t('settings.key.connect')}
                    variant="accent"
                    disabled={signIn.state === 'starting'}
                    onPress={start}
                    testID={`connector-connect-${connector.id}`}
                />
            </Row>
            {signIn.state === 'starting' ? <Spinner size="sm" /> : null}
            {signIn.state === 'failed' ? (
                <Notice tone={signIn.reason === 'closed' ? 'info' : 'danger'} {...browserSignInNotice(signIn, name, t)} testID="browser-sign-in-failed" />
            ) : null}
        </Stack>
    );
}
