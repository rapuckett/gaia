// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { providerName } from '@webui/utils/providerText';

import type { ProviderConnected } from '@/api/client.types';
import { ENDPOINTS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { useDeviceRefused } from '@/api/routeAccess';
import { useForgetProviderKey, useReconnectProvider, useRetryKeyStore, useSendProviderKey, type ProviderRow } from '@/data';
import { describeHttpFailure, ltr, useT, type Translate } from '@/i18n/useT';
import { PcOnlyAction } from '@/features/logs/PcOnlyAction';
import { Badge, Button, Notice, Row, Stack, Text, TextField } from '@/ui';
import { KeyRound, Trash2 } from '@/ui/icons';

import { useConfirmSheet } from '../../../setup/sheets/ConfirmSheet';
import { isPcRefusal, PcOnlyNotice } from '../../PcOnlyNotice';

/** `locked`: the PC's OS key store is locked (423), with Try again where this phone may ask. */
type Outcome = { tone: 'success' | 'info' | 'warning' | 'danger'; text: string; detail?: string } | { tone: 'locked'; detail?: string };

function connectedOutcome(r: ProviderConnected, name: string, t: Translate): Outcome {
    if (r.remember_error) return { tone: 'warning', text: t('mobileApp.settings.key.sessionOnly'), detail: r.remember_error };
    if (r.known_models) return { tone: 'success', text: t('settings.key.knownModels', { name }) };
    return { tone: 'success', text: r.remembered ? t('settings.key.kept') : t('settings.key.connectedDone') };
}

/** Dev scenes: the key field opened by Replace, fixture text typed into it, and Connect pressed on arrival. */
export const SeedProviderKey = createContext<{ replacing?: boolean; typed?: string; submit?: boolean } | null>(null);

/**
 * A cloud provider's API key: Connect with a key typed here, or Reconnect with the one the PC holds, and
 * Replace or Remove once connected. The key lives only in this field until it is sent, and the field clears
 * on every send. When the PC refuses a typed key from this phone (403), the field gives way to "Change this
 * on the PC"; Remove and the key store's Try again show only where the phone's routes allow them.
 */
export function ProviderKey({ provider, connected }: { provider: ProviderRow; connected: boolean }) {
    const t = useT();
    const name = providerName(t, provider);
    const seed = useContext(SeedProviderKey);
    const reconnect = useReconnectProvider();
    const sendKey = useSendProviderKey();
    const forget = useForgetProviderKey();
    const retry = useRetryKeyStore();
    const removeRefused = useDeviceRefused('DELETE', ENDPOINTS.providerKey);
    const retryRefused = useDeviceRefused('POST', ENDPOINTS.providersKeyStoreRetry);
    const { ask, sheet } = useConfirmSheet();
    const [key, setKey] = useState(seed?.typed ?? '');
    const [replacing, setReplacing] = useState(!!seed?.replacing);
    const [refused, setRefused] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);

    // Model mounts one per provider, so leaving the screen or picking another provider both unmount.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const movedOn = () => !mounted.current;

    // The PC's own words go on the detail line, under our sentence; a typed key never reaches them.
    const failed = (err: unknown) => {
        if (movedOn()) return;
        if (isPcRefusal(err)) {
            setRefused(true);
            return;
        }
        if (err instanceof GaiaApiError && err.status === 423) {
            setOutcome({ tone: 'locked', detail: err.detail || undefined });
            return;
        }
        if (err instanceof GaiaApiError && err.status === 422) {
            setOutcome({ tone: 'danger', text: t('mobileApp.settings.key.rejected', { name: ltr(name) }), detail: err.detail || undefined });
            return;
        }
        const f = describeHttpFailure(err, t);
        setOutcome({ tone: 'danger', text: f.text, detail: f.detail });
    };

    const waiting = (detail: string) => !movedOn() && setOutcome({ tone: 'info', text: t('settings.key.waitingOs'), detail: detail || undefined });

    const onReconnect = () => {
        setOutcome(null);
        reconnect.mutate(
            { provider: provider.id, onWaiting: waiting, stopped: movedOn },
            { onSuccess: (r) => !movedOn() && setOutcome(connectedOutcome(r, name, t)), onError: failed },
        );
    };

    const onRetryStore = () => retry.mutate(undefined, { onSuccess: () => !movedOn() && setOutcome(null), onError: failed });

    const onRemove = async () => {
        const sure = await ask({
            title: t('settings.key.removeAsk'),
            body: [t('settings.key.removeBody', { name: ltr(name) })],
            confirmLabel: t('settings.key.remove'),
            cancelLabel: t('settings.key.cancel'),
            danger: true,
        });
        if (!sure || movedOn()) return;
        setOutcome(null);
        forget.mutate(provider.id, { onSuccess: () => !movedOn() && setOutcome({ tone: 'success', text: t('settings.key.cleared') }), onError: failed });
    };

    const onSubmit = () => {
        const typed = key.trim();
        setKey('');
        if (!typed) return;
        setOutcome(null);
        sendKey
            .send(provider.id, typed, { onWaiting: waiting, stopped: movedOn })
            .then(
                (r) => {
                    if (movedOn()) return;
                    setReplacing(false);
                    setOutcome(connectedOutcome(r, name, t));
                },
                failed,
            );
    };

    const seededSubmit = useRef(!!seed?.submit);
    useEffect(() => {
        if (!seededSubmit.current) return;
        seededSubmit.current = false;
        onSubmit();
        // Once, on arrival, for a dev scene.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const busy = reconnect.isPending || sendKey.isPending || forget.isPending || retry.isPending;
    const showField = !refused && (!connected || replacing);

    return (
        <Stack gap="sm" testID="provider-key">
            <Row gap="sm" justify="between">
                <Text role="label" weight="medium" tone="secondary" accessibilityRole="header">{t('settings.key.title')}</Text>
                <Badge
                    tone={connected ? 'success' : 'danger'}
                    label={t.bare(connected ? 'settings.key.connected' : 'settings.key.notConnected')}
                    accessibilityLabel={t(connected ? 'settings.key.connected' : 'settings.key.notConnected')}
                />
            </Row>

            {showField ? (
                <>
                    <TextField
                        value={key}
                        onChangeText={setKey}
                        placeholder={t.bare(replacing ? 'settings.key.pasteNew' : 'settings.key.paste')}
                        accessibilityLabel={t('settings.key.fieldAria', { name })}
                        accessibilityHint={t(replacing ? 'settings.key.pasteNew' : 'settings.key.paste')}
                        secret
                        autoFocus={replacing && !seed}
                        disabled={busy}
                        returnKeyType="done"
                        onSubmitEditing={() => (key.trim() && !busy ? onSubmit() : undefined)}
                        testID="provider-key-field"
                    />
                    <Button
                        variant="primary"
                        full
                        label={t(replacing ? 'settings.key.save' : 'settings.key.connect')}
                        busy={sendKey.isPending}
                        disabled={busy || !key.trim()}
                        onPress={onSubmit}
                        testID="provider-key-connect"
                    />
                    {replacing ? (
                        <Button
                            variant="secondary"
                            full
                            label={t('settings.key.cancel')}
                            disabled={busy}
                            onPress={() => {
                                setKey('');
                                setReplacing(false);
                            }}
                            testID="provider-key-cancel"
                        />
                    ) : null}
                </>
            ) : null}

            {!connected && !replacing ? (
                <Button
                    variant="secondary"
                    full
                    label={t('settings.key.reconnect')}
                    busy={reconnect.isPending}
                    disabled={busy}
                    onPress={onReconnect}
                    testID="provider-key-reconnect"
                />
            ) : null}

            {connected && !replacing ? (
                <>
                    {refused ? (
                        <PcOnlyAction label={t('settings.key.replace')} icon={KeyRound} detail={t('mobileApp.settings.pcOnly')} testID="provider-key-replace" />
                    ) : (
                        <Button
                            variant="secondary"
                            full
                            icon={KeyRound}
                            label={t('settings.key.replace')}
                            disabled={busy}
                            onPress={() => {
                                setOutcome(null);
                                setReplacing(true);
                            }}
                            testID="provider-key-replace"
                        />
                    )}
                    {removeRefused ? (
                        <PcOnlyAction label={t('settings.key.remove')} icon={Trash2} detail={t('mobileApp.settings.pcOnly')} testID="provider-key-remove" />
                    ) : (
                        <Button
                            variant="danger"
                            full
                            icon={Trash2}
                            label={t('settings.key.remove')}
                            busy={forget.isPending}
                            disabled={busy}
                            onPress={() => void onRemove()}
                            testID="provider-key-remove"
                        />
                    )}
                </>
            ) : null}
            {refused ? <PcOnlyNotice testID="provider-key-pc-only" /> : null}
            {outcome?.tone === 'locked' ? (
                <Notice
                    tone="warning"
                    message={t('settings.key.storeLocked')}
                    detail={outcome.detail}
                    action={retryRefused || busy ? undefined : { label: t('settings.key.unlockAgain'), onPress: onRetryStore }}
                    testID="provider-key-locked"
                />
            ) : outcome ? (
                <Notice tone={outcome.tone} message={outcome.text} detail={outcome.detail} testID="provider-key-outcome" />
            ) : null}
            {sheet}
        </Stack>
    );
}
