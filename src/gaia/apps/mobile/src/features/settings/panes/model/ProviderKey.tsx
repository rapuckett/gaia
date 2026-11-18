// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { providerName } from '@webui/utils/providerText';

import type { ProviderConnected } from '@/api/client.types';
import { useReconnectProvider, useSendProviderKey, type ProviderRow } from '@/data';
import { describeHttpFailure, useT, type Translate } from '@/i18n/useT';
import { PcOnlyAction } from '@/features/logs/PcOnlyAction';
import { Badge, Button, Notice, Row, Stack, Text, TextField } from '@/ui';
import { KeyRound, Trash2 } from '@/ui/icons';

import { isPcRefusal, PcOnlyNotice } from '../../PcOnlyNotice';
import { errorText, refusedOnPhone } from './modelText';

type Outcome = { tone: 'success' | 'info' | 'danger'; text: string; detail?: string };

function connectedOutcome(r: ProviderConnected, name: string, t: Translate): Outcome {
    if (r.remember_error) return { tone: 'success', text: t('mobileApp.settings.key.sessionOnly'), detail: r.remember_error };
    if (r.known_models) return { tone: 'success', text: t('settings.key.knownModels', { name }) };
    return { tone: 'success', text: r.remembered ? t('settings.key.kept') : t('settings.key.connectedDone') };
}

/** Dev scenes: the key field opened by Replace, fixture text typed into it, and Connect pressed on arrival. */
export const SeedProviderKey = createContext<{ replacing?: boolean; typed?: string; submit?: boolean } | null>(null);

/**
 * A cloud provider's API key: Connect with a key typed here, or Reconnect with the one the PC holds, and
 * Replace once connected. The key lives only in this field until it is sent, and the field clears on every
 * send. When the PC refuses a typed key from this phone (403), the field gives way to "Change this on the PC".
 */
export function ProviderKey({ provider, connected }: { provider: ProviderRow; connected: boolean }) {
    const t = useT();
    const name = providerName(t, provider);
    const seed = useContext(SeedProviderKey);
    const reconnect = useReconnectProvider();
    const sendKey = useSendProviderKey();
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

    const onReconnect = () => {
        setOutcome(null);
        reconnect.mutate(
            { provider: provider.id, onWaiting: (detail) => !movedOn() && setOutcome({ tone: 'info', text: detail }), stopped: movedOn },
            {
                onSuccess: (r) => !movedOn() && setOutcome(connectedOutcome(r, name, t)),
                onError: (err) =>
                    !movedOn() && (refusedOnPhone(err) ? setRefused(true) : setOutcome({ tone: 'danger', text: errorText(err, t) })),
            },
        );
    };

    const onSubmit = () => {
        const typed = key.trim();
        setKey('');
        if (!typed) return;
        setOutcome(null);
        sendKey
            .send(provider.id, typed, { onWaiting: (detail) => !movedOn() && setOutcome({ tone: 'info', text: detail }), stopped: movedOn })
            .then(
                (r) => {
                    if (movedOn()) return;
                    setReplacing(false);
                    setOutcome(connectedOutcome(r, name, t));
                },
                (err: unknown) => {
                    if (movedOn()) return;
                    if (isPcRefusal(err)) {
                        setRefused(true);
                        return;
                    }
                    const failed = describeHttpFailure(err, t);
                    setOutcome({ tone: 'danger', text: failed.text, detail: failed.detail });
                },
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

    const busy = reconnect.isPending || sendKey.isPending;
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
                        secureTextEntry
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
                    <PcOnlyAction label={t('settings.key.remove')} icon={Trash2} detail={t('mobileApp.settings.pcOnly')} testID="provider-key-remove" />
                </>
            ) : null}
            {refused ? <PcOnlyNotice testID="provider-key-pc-only" /> : null}
            {outcome ? <Notice tone={outcome.tone} message={outcome.text} detail={outcome.detail} testID="provider-key-outcome" /> : null}
        </Stack>
    );
}
