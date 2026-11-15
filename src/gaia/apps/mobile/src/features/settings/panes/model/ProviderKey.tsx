// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { providerName } from '@webui/utils/providerText';

import type { ProviderConnected, ProviderInfo } from '@/api/client.types';
import { CONNECT_RETRY_MS, ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { useProviders, useReconnectProvider, useRetryKeyStore } from '@/data';
import { useT, type Translate } from '@/i18n/useT';
import { Badge, Button, Notice, Row, Stack, Surface, Text } from '@/ui';

import { errorText, isolate, refusedOnPhone } from './modelText';

function maskedKey(p: ProviderInfo, t: Translate): string {
    if (p.key_source === 'environment') return t('settings.key.setIn', { name: p.env_var ?? '' });
    return isolate(`••••••••••••••••••••${p.key_hint ? ` ${p.key_hint}` : ''}`);
}

function connectedText(r: ProviderConnected, name: string, t: Translate): string {
    if (r.remember_error) return t('settings.key.sessionOnly', { reason: r.remember_error });
    if (r.known_models) return t('settings.key.knownModels', { name });
    return r.remembered ? t('settings.key.kept') : t('settings.key.connectedDone');
}

type Outcome = { tone: 'success' | 'info' | 'danger'; text: string } | { tone: 'pcOnly' };

/**
 * A cloud provider's API key, as the web's Model settings shows it. The PC refuses a typed key from a
 * phone (`connect` with a key, and Remove key, are PC-only), so the phone never offers a key field: it
 * shows the key's state, Reconnect with the key the PC holds, and where to change it.
 */
export function ProviderKey({ provider, connected }: { provider: ProviderInfo; connected: boolean }) {
    const t = useT();
    const name = providerName(t, provider);
    const providers = useProviders();
    const reconnect = useReconnectProvider();
    const retry = useRetryKeyStore();
    const retryRefused = useDeviceRefused('POST', ENDPOINTS.providersKeyStoreRetry);
    const [outcome, setOutcome] = useState<Outcome | null>(null);

    // Model mounts one per provider, so leaving the screen or picking another provider both unmount.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Ask again while the PC's OS keychain dialog is open, so answering it there is enough.
    const waitingOs = provider.key_state === 'waiting_for_os_permission';
    const { refetch } = providers;
    useEffect(() => {
        if (!waitingOs) return;
        const timer = setInterval(() => void refetch(), CONNECT_RETRY_MS);
        return () => clearInterval(timer);
    }, [waitingOs, refetch]);

    const onReconnect = () => {
        setOutcome(null);
        const movedOn = () => !mounted.current;
        reconnect.mutate(
            { provider: provider.id, onWaiting: (detail) => !movedOn() && setOutcome({ tone: 'info', text: detail }), stopped: movedOn },
            {
                onSuccess: (r) => !movedOn() && setOutcome({ tone: 'success', text: connectedText(r, name, t) }),
                onError: (err) =>
                    !movedOn() && setOutcome(refusedOnPhone(err) ? { tone: 'pcOnly' } : { tone: 'danger', text: errorText(err, t) }),
            },
        );
    };

    const onRetry = () => {
        setOutcome(null);
        retry.mutate(undefined, {
            onError: (err) =>
                mounted.current && setOutcome(refusedOnPhone(err) ? { tone: 'pcOnly' } : { tone: 'danger', text: errorText(err, t) }),
        });
    };

    const saved = !!provider.key_source;
    const fromEnv = provider.key_source === 'environment';
    // What the web offers here that the PC accepts only from itself: paste and Connect (with the AMD
    // gateway's URL and header) while no key is saved, and Replace and Remove key for a saved one.
    const pcOnlyActions = !saved || !fromEnv || !!provider.key_from_gaia_env;
    const busy = reconnect.isPending || retry.isPending;

    return (
        <Stack gap="sm" testID="provider-key">
            <Row gap="sm" justify="between">
                <Text role="label" weight="medium" tone="secondary">{t('settings.key.title')}</Text>
                {saved ? (
                    <Badge
                        tone={connected ? 'success' : 'danger'}
                        label={t.bare(connected ? 'settings.key.connected' : 'settings.key.notConnected')}
                        accessibilityLabel={t(connected ? 'settings.key.connected' : 'settings.key.notConnected')}
                    />
                ) : null}
            </Row>

            {!saved && provider.key_state === 'store_locked' ? (
                <Notice
                    tone="warning"
                    message={t('settings.key.storeLocked')}
                    action={busy || retryRefused ? undefined : { label: t('settings.key.unlockAgain'), onPress: onRetry }}
                />
            ) : null}
            {!saved && provider.key_state !== 'store_locked' ? (
                <Text role="caption" tone="muted">
                    {waitingOs ? (provider.key_message ?? t('settings.key.waitingOs')) : t('settings.key.none')}
                </Text>
            ) : null}

            {saved ? (
                <Surface tone="recessed" radius="md" padding="md" border accessibilityLabel={t('settings.key.savedAria', { name })}>
                    <Text role="ui" mono={!fromEnv} numberOfLines={1} testID="provider-key-masked">
                        {maskedKey(provider, t)}
                    </Text>
                </Surface>
            ) : null}
            {saved && !connected ? (
                <Button
                    variant="primary"
                    full
                    label={t('settings.key.reconnect')}
                    busy={reconnect.isPending}
                    disabled={busy}
                    onPress={onReconnect}
                />
            ) : null}
            {saved && !connected && !provider.error ? (
                <Text role="caption" tone="muted">{t('settings.key.notConnectedHint', { name })}</Text>
            ) : null}
            {provider.error ? <Notice tone="danger" message={provider.error} /> : null}

            {pcOnlyActions || outcome?.tone === 'pcOnly' ? (
                <Notice tone="info" role="note" message={t('mobileApp.settings.pcOnly')} testID="provider-key-pc-only" />
            ) : null}
            {outcome && outcome.tone !== 'pcOnly' ? <Notice tone={outcome.tone} message={outcome.text} /> : null}

            {provider.known_models ? <Notice tone="info" role="note" message={t('settings.key.knownList', { name })} /> : null}
        </Stack>
    );
}
