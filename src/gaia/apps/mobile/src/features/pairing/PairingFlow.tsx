// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from 'react';

import { describeError, useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { Button, Card, Icon, Row, Screen, Spinner, Stack, Text, TextField } from '@/ui';
import { CircleAlert, Clock, Smartphone } from '@/ui/icons';

import { parseInvite } from './invite';
import { getPairingService } from './registry';
import type { PairingStatus, RedeemResult } from './service';

export type PairingStep = 'welcome' | 'how' | 'manual';

type View = PairingStep | { at: 'waiting'; pcName: string } | { at: 'refused'; rateLimited: boolean } | { at: 'unreachable' };

const POLL_MS = 2000;

export interface PairingFlowProps {
    initialStep?: PairingStep;
    /** Called once a PC has allowed this phone, after the connection is set. */
    onPaired?: () => void;
    /** Shows a "Scan the code" button; the camera scanner is Mobile's. */
    onScan?: () => void;
}

/** First launch: welcome, how to pair, paste a link or code, wait for Allow, and the two ways it can fail. */
export function PairingFlow({ initialStep = 'welcome', onPaired, onScan }: PairingFlowProps) {
    const t = useT();
    const setConnection = useConnectionStore((s) => s.setConnection);
    const [view, setView] = useState<View>(initialStep);
    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const settle = useCallback(
        (result: PairingStatus | RedeemResult) => {
            if (!alive.current) return;
            switch (result.state) {
                case 'pending':
                    setView({ at: 'waiting', pcName: result.pcName });
                    break;
                case 'paired':
                    setConnection(result.pc.connection);
                    onPaired?.();
                    break;
                case 'refused':
                    setView({ at: 'refused', rateLimited: result.rateLimited === true });
                    break;
                case 'unreachable':
                    setView({ at: 'unreachable' });
                    break;
                case 'none':
                    break;
            }
        },
        [onPaired, setConnection],
    );

    // A phone that was already waiting for Allow when the app reopened picks up where it was.
    useEffect(() => {
        getPairingService()
            .status()
            .then(settle)
            .catch((e) => alive.current && setError(describeError(e, t)));
    }, [settle, t]);

    const waiting = typeof view === 'object' && view.at === 'waiting';
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(() => {
            getPairingService()
                .status()
                .then(settle)
                .catch((e) => alive.current && setError(describeError(e, t)));
        }, POLL_MS);
        return () => clearInterval(timer);
    }, [waiting, settle, t]);

    const submit = async () => {
        setError(null);
        let invite;
        try {
            invite = parseInvite(text);
        } catch (e) {
            setError(describeError(e, t));
            return;
        }
        setBusy(true);
        try {
            settle(await getPairingService().redeem(invite));
        } catch (e) {
            if (alive.current) setError(describeError(e, t));
        } finally {
            if (alive.current) setBusy(false);
        }
    };

    const cancel = () => {
        void getPairingService().cancel();
        setView('how');
    };

    const retry = () => {
        setError(null);
        setView('how');
    };

    if (typeof view === 'object' && view.at === 'waiting') {
        return (
            <Page icon={Clock} title={t('mobileApp.pairing.waiting.title')} body={t('mobileApp.pairing.waiting.body', { pc: view.pcName })} busy>
                <Button variant="secondary" label={t('mobileApp.pairing.waiting.cancel')} onPress={cancel} full />
            </Page>
        );
    }
    if (typeof view === 'object' && view.at === 'refused') {
        return (
            <Page
                icon={CircleAlert}
                title={t('mobileApp.pairing.refused.title')}
                body={t(view.rateLimited ? 'mobileApp.pairing.refused.rateLimited' : 'mobileApp.pairing.refused.body')}
            >
                <Button variant="primary" label={t('mobileApp.pairing.refused.retry')} onPress={retry} full />
            </Page>
        );
    }
    if (typeof view === 'object' && view.at === 'unreachable') {
        return (
            <Page icon={CircleAlert} title={t('mobileApp.pairing.off.title')} body={t('mobileApp.pairing.off.body')}>
                <Button variant="primary" label={t('mobileApp.pairing.off.retry')} onPress={retry} full />
            </Page>
        );
    }
    if (view === 'welcome') {
        return (
            <Page icon={Smartphone} title={t('mobileApp.pairing.welcome.title')} body={t('mobileApp.pairing.welcome.body')}>
                <Button variant="primary" label={t('mobileApp.pairing.welcome.start')} onPress={() => setView('how')} full />
            </Page>
        );
    }
    if (view === 'how') {
        const steps = ['step1', 'step2', 'step3', 'step4'] as const;
        return (
            <Page title={t('mobileApp.pairing.how.title')}>
                <Card>
                    <Stack gap="md">
                        {steps.map((step, i) => (
                            <Row key={step} gap="md" align="start">
                                <Text role="body" weight="semibold" tone="accent">
                                    {i + 1}
                                </Text>
                                <Stack flex={1}>
                                    <Text role="body">{t(`mobileApp.pairing.how.${step}`)}</Text>
                                </Stack>
                            </Row>
                        ))}
                    </Stack>
                </Card>
                {onScan ? <Button variant="primary" label={t('mobileApp.pairing.how.scan')} onPress={onScan} full /> : null}
                <Button variant={onScan ? 'secondary' : 'primary'} label={t('mobileApp.pairing.how.paste')} onPress={() => setView('manual')} full />
            </Page>
        );
    }
    return (
        <Page title={t('mobileApp.pairing.manual.title')} body={t('mobileApp.pairing.manual.body')}>
            <TextField
                label={t('mobileApp.pairing.manual.label')}
                value={text}
                onChangeText={(v) => {
                    setText(v);
                    setError(null);
                }}
                error={error ?? undefined}
                multiline
                maxLines={4}
                returnKeyType="done"
                disabled={busy}
                testID="pairing-input"
            />
            <Button variant="primary" label={t('mobileApp.pairing.manual.submit')} onPress={() => void submit()} busy={busy} full />
            <Button variant="ghost" label={t('mobileApp.pairing.manual.back')} onPress={() => setView('how')} full />
        </Page>
    );
}

function Page({
    icon,
    title,
    body,
    busy,
    children,
}: {
    icon?: typeof Clock;
    title: string;
    body?: string;
    busy?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <Screen banner={null} keyboard="avoid" scroll>
            <Stack flex={1} gap="lg" padding="xl" justify="center" maxWidth={560} self="center">
                {icon ? (
                    <Stack align="center">
                        <Icon icon={icon} size="lg" tone="accent" />
                    </Stack>
                ) : null}
                <Text role="title" weight="semibold" align="center">
                    {title}
                </Text>
                {body ? (
                    <Text role="body" tone="secondary" align="center">
                        {body}
                    </Text>
                ) : null}
                {busy ? <Spinner /> : null}
                {children}
            </Stack>
        </Screen>
    );
}
