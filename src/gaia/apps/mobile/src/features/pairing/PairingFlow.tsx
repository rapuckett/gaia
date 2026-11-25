// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { GaiaApiError, GaiaPinMismatchError } from '@/api/errors';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { Button, Card, Icon, Notice, NumberMarker, Row, Screen, Spinner, Stack, Text, TextField, UpButton, useBackStep } from '@/ui';
import { CircleAlert, Clock, Monitor, Smartphone, Wifi } from '@/ui/icons';

import { parseInvite, type PairingInvite } from './invite';
import { localNetworkDenied, localNetworkStep, markAllowed, markExplained, watchForeground } from './localNetwork';
import { forgetPc, switchToPc } from './pairedPcs';
import { PairingScanner } from './PairingScanner';
import { isNetworkFailure, pollSettled } from './pollSettled';
import { getPairingService } from './registry';
import type { PairedPc, PairingStatus, RedeemResult } from './service';

export type PairingStep = 'welcome' | 'how' | 'manual' | 'scan';

type Confirm = { at: 'confirm'; invite: PairingInvite; replaces: boolean; pairedBefore: boolean; back: PairingStep };

type View =
    | PairingStep
    | Confirm
    /** Before the first connection to a home address, which raises iOS's local network prompt. */
    | { at: 'localNetwork'; confirm: Confirm }
    /** No home address answered, and the phone's local network setting stopped it. */
    | { at: 'localNetworkDenied'; invite: PairingInvite; replaces: boolean }
    | { at: 'waiting'; pcName: string }
    | { at: 'refused'; rateLimited: boolean }
    | { at: 'unreachable' };

const POLL_MS = 2000;

export interface PairingFlowProps {
    initialStep?: PairingStep;
    /** Called once a PC has allowed this phone, after the connection is set. */
    onPaired?: () => void;
    /** Replaces the built-in camera step behind "Scan the code". */
    onScan?: () => void;
    /** Where the first step goes back to when it was opened from another screen; its Back button and Android's back both use it. */
    onExit?: () => void;
    /** False while a drawer route keeps this flow mounted behind another screen, so its Android back stays out of the way. */
    backActive?: boolean;
}

/** First launch: welcome, how to pair, paste a link or code, wait for Allow, and the two ways it can fail. */
export function PairingFlow({ initialStep = 'welcome', onPaired, onScan, onExit, backActive = true }: PairingFlowProps) {
    const t = useT();
    const setConnection = useConnectionStore((s) => s.setConnection);
    const removedFrom = useConnectionStore((s) => s.removedFrom);
    const forgottenPc = useConnectionStore((s) => s.forgottenPc);
    const noPcInUse = useConnectionStore((s) => s.connection === null);
    const [view, setView] = useState<View>(forgottenPc ? 'how' : initialStep);
    const [text, setText] = useState('');
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const alive = useRef(true);
    // Bumped when the person backs out of Pair while a code is being redeemed, so that answer is taken back.
    const redeeming = useRef(0);

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

    // The PC no longer knows this phone, and the notice saying so is on screen: only now is it forgotten here.
    const forgetting = useRef<string | null>(null);
    useEffect(() => {
        if (!forgottenPc || view !== 'how' || forgetting.current === forgottenPc.id) return;
        forgetting.current = forgottenPc.id;
        forgetPc(forgottenPc.id).catch((e: unknown) => {
            console.error(`Forgetting ${forgottenPc.name} on this phone failed`, e);
            if (alive.current) setError(describeHttpFailure(e, t));
        });
    }, [forgottenPc, view, t]);

    // A phone that was already waiting for Allow when the app reopened picks up where it was.
    useEffect(() => {
        getPairingService()
            .status()
            .then(settle)
            .catch((e) => alive.current && setError(describeHttpFailure(e, t)));
    }, [settle, t]);

    // The camera exists on a phone build only; the web build pastes.
    const canScan = onScan !== undefined || Platform.OS !== 'web';
    const waiting = typeof view === 'object' && view.at === 'waiting';
    // Checks until the PC answers: allowed, refused or gone. Only a network failure is tried again.
    useEffect(() => {
        if (!waiting) return;
        return pollSettled(
            () => getPairingService().status(),
            POLL_MS,
            (result) => {
                // Nothing waits for Allow any more (canceled elsewhere, or its key is gone), so this code is spent.
                settle(result.state === 'none' ? { state: 'refused' } : result);
                return result.state === 'pending';
            },
            (e) => {
                if (alive.current) setError(describeHttpFailure(e, t));
                return isNetworkFailure(e);
            },
        );
    }, [waiting, settle, t]);

    // A code only names a PC; the person confirms it before this phone sends the invitation.
    const submit = async (code: string = text) => {
        setError(null);
        let invite;
        try {
            invite = parseInvite(code);
        } catch (e) {
            setError(describeHttpFailure(e, t));
            return;
        }
        setBusy(true);
        try {
            const paired = await getPairingService().list();
            if (!alive.current) return;
            setView({
                at: 'confirm',
                invite,
                replaces: paired.some((pc) => pc.id === invite.pc_id),
                pairedBefore: paired.length > 0,
                back: view === 'scan' ? 'scan' : 'manual',
            });
        } catch (e) {
            if (alive.current) setError(describeHttpFailure(e, t));
        } finally {
            if (alive.current) setBusy(false);
        }
    };

    /**
     * `watch` looks for the local network permission being off while no home address has answered on this install;
     * `retry` is the denied card's try after the app comes back, which leaves the card up unless the PC answers.
     */
    const redeem = async (invite: PairingInvite, replaces: boolean, mode: 'plain' | 'watch' | 'retry' = 'plain') => {
        setError(null);
        setBusy(true);
        const attempt = ++redeeming.current;
        const abandoned = () => attempt !== redeeming.current;
        const started = Date.now();
        const foreground = mode === 'plain' ? null : watchForeground();
        try {
            const result = await getPairingService().redeem(invite);
            // Backed out mid-redeem: the PC already holds a request, so take it back, as Cancel does.
            if (abandoned()) {
                if (result.state === 'pending') await getPairingService().cancel();
                return;
            }
            if (mode !== 'plain') {
                if (result.state !== 'unreachable') {
                    rememberAllowed();
                } else if (await localNetworkDenied(invite.origins, { elapsedMs: Date.now() - started, leftForeground: foreground!.left(), retrying: mode === 'retry' })) {
                    if (alive.current && !abandoned()) setView({ at: 'localNetworkDenied', invite, replaces });
                    return;
                }
            }
            settle(result);
        } catch (e) {
            // An HTTP answer or a certificate means a home address was reached.
            if (mode !== 'plain' && (e instanceof GaiaApiError || e instanceof GaiaPinMismatchError)) rememberAllowed();
            if (alive.current && !abandoned()) {
                // A first pairing never connected, so "stopped connecting" would be wrong.
                setError(e instanceof GaiaPinMismatchError && !replaces ? { text: t('mobileApp.pairing.pinMismatch.first') } : describeHttpFailure(e, t));
            }
        } finally {
            foreground?.stop();
            if (alive.current && !abandoned()) setBusy(false);
        }
    };
    const redeemLatest = useRef(redeem);
    useEffect(() => {
        redeemLatest.current = redeem;
    });

    // The explainer goes before the first connection to a home address, since that connection raises iOS's prompt.
    const pair = async (confirm: Confirm) => {
        let step;
        try {
            step = await localNetworkStep(confirm.invite.origins, confirm.pairedBefore);
        } catch (e) {
            if (alive.current) setError(describeHttpFailure(e, t));
            return;
        }
        if (!alive.current) return;
        if (step === 'explain') setView({ at: 'localNetwork', confirm });
        else void redeem(confirm.invite, confirm.replaces, step === 'watch' ? 'watch' : 'plain');
    };

    const continueToPrompt = (confirm: Confirm) => {
        markExplained().catch((e: unknown) => console.error("Couldn't note that the local network explainer was shown; it may show again", e));
        void redeem(confirm.invite, confirm.replaces, 'watch');
    };

    const deniedFor = typeof view === 'object' && view.at === 'localNetworkDenied' ? view : null;
    // Back from Settings (or from iOS's prompt), try once; another failure leaves the card up, with no loop.
    useEffect(() => {
        if (!deniedFor) return;
        let state = AppState.currentState;
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active' && state !== 'active') void redeemLatest.current(deniedFor.invite, deniedFor.replaces, 'retry');
            state = next;
        });
        return () => sub.remove();
    }, [deniedFor]);

    const cancel = () => {
        void getPairingService().cancel();
        setView('how');
    };

    const retry = () => {
        setError(null);
        setView('how');
    };

    // Android's back walks the flow one step back, as its own back controls do; on the first step it leaves, or goes to `onExit`.
    useBackStep(() => {
        if (!backActive) return false;
        if (typeof view === 'object') {
            if (view.at === 'confirm' || view.at === 'localNetwork') {
                if (busy) {
                    redeeming.current++;
                    setBusy(false);
                }
                setError(null);
                setView(view.at === 'confirm' ? view.back : view.confirm);
            } else if (view.at === 'waiting') {
                cancel();
            } else {
                retry();
            }
            return true;
        }
        if (view === 'scan' || view === 'manual') {
            setError(null);
            setView('how');
            return true;
        }
        if (view === 'how' && initialStep === 'welcome') {
            setView('welcome');
            return true;
        }
        if (view === 'how' && onExit) {
            onExit();
            return true;
        }
        return false;
    });

    if (typeof view === 'object' && view.at === 'localNetwork') {
        const { confirm } = view;
        return <LocalNetworkExplainer onContinue={() => continueToPrompt(confirm)} busy={busy} error={error} />;
    }
    if (typeof view === 'object' && view.at === 'localNetworkDenied') {
        return <LocalNetworkDenied onBack={retry} busy={busy} error={error} />;
    }
    if (typeof view === 'object' && view.at === 'confirm') {
        const confirm = view;
        const { invite, replaces, back } = view;
        const addresses = invite.origins.map((o) => o.slice('https://'.length)).join(', ');
        return (
            <Page
                icon={Monitor}
                title={t('mobileApp.pairing.confirm.title', { pc: invite.name })}
                body={t('mobileApp.pairing.confirm.body')}
                footer={
                    <>
                        <Button variant="primary" label={t('mobileApp.pairing.confirm.pair')} onPress={() => void pair(confirm)} busy={busy} full testID="pairing-confirm" />
                        <Button variant="secondary" label={t('mobileApp.pairing.confirm.cancel')} onPress={() => setView(back)} disabled={busy} full />
                    </>
                }
            >
                <Card>
                    <Stack gap="xs">
                        <Text role="caption" tone="secondary">
                            {t('mobileApp.pairing.confirm.address')}
                        </Text>
                        <Text role="body" selectable>
                            {addresses}
                        </Text>
                    </Stack>
                </Card>
                {replaces ? <Notice tone="warning" message={t('mobileApp.pairing.confirm.replaces', { pc: invite.name })} /> : null}
                {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
            </Page>
        );
    }
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
                {removedFrom ? <Notice tone="warning" message={t('mobileApp.pairing.removed', { pc: removedFrom })} testID="pairing-removed" /> : null}
                <Button variant="primary" label={t('mobileApp.pairing.welcome.start')} onPress={() => setView('how')} full testID="pairing-start" />
                {noPcInUse ? <SavedPcs hide={forgottenPc?.id ?? null} /> : null}
            </Page>
        );
    }
    if (view === 'scan') {
        return (
            <Page title={t('mobileApp.pairing.how.scan')}>
                <PairingScanner onCode={(code) => void submit(code)} testID="pairing-scanner" />
                {busy ? <Spinner /> : null}
                {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
                <Button variant="secondary" label={t('mobileApp.pairing.how.paste')} onPress={() => setView('manual')} full />
                <Button variant="ghost" label={t('mobileApp.pairing.manual.back')} onPress={() => setView('how')} full />
            </Page>
        );
    }
    if (view === 'how') {
        const steps = ['step1', 'step2', 'step3', 'step4'] as const;
        return (
            <Page
                title={t('mobileApp.pairing.how.title')}
                up={onExit ? <UpButton onPress={onExit} testID="pairing-up" /> : undefined}
                notice={
                    forgottenPc ? (
                        <Notice
                            tone="warning"
                            title={t('mobileApp.pairing.again.forgottenTitle', { pc: forgottenPc.name })}
                            message={t('mobileApp.pairing.again.forgottenBody')}
                            testID="pairing-forgotten"
                        />
                    ) : undefined
                }
            >
                <Card>
                    <Stack gap="md">
                        {steps.map((step, i) => (
                            <Row key={step} gap="md" align="start">
                                <NumberMarker role="body" weight="semibold" tone="accent">
                                    {i + 1}
                                </NumberMarker>
                                <Stack flex={1}>
                                    <Text role="body">{t(`mobileApp.pairing.how.${step}`)}</Text>
                                </Stack>
                            </Row>
                        ))}
                    </Stack>
                </Card>
                {canScan ? <Button variant="primary" label={t('mobileApp.pairing.how.scan')} onPress={onScan ?? (() => setView('scan'))} full /> : null}
                <Button variant={canScan ? 'secondary' : 'primary'} label={t('mobileApp.pairing.how.paste')} onPress={() => setView('manual')} full testID="pairing-paste" />
                {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
                {noPcInUse ? <SavedPcs hide={forgottenPc?.id ?? null} /> : null}
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
                error={error?.text}
                multiline
                maxLines={4}
                returnKeyType="done"
                disabled={busy}
                testID="pairing-input"
            />
            {error?.detail ? (
                <Text role="caption" tone="muted" dir="ltr" align="ltr">
                    {error.detail}
                </Text>
            ) : null}
            <Button variant="primary" label={t('mobileApp.pairing.manual.submit')} onPress={() => void submit()} busy={busy} full />
            <Button variant="ghost" label={t('mobileApp.pairing.manual.back')} onPress={() => setView('how')} full />
        </Page>
    );
}

function rememberAllowed() {
    markAllowed().catch((e: unknown) => console.error("Couldn't note that this phone reached a PC on the local network", e));
}

type ShownError = { text: string; detail?: string } | null;

/** With no PC in use, the PCs still paired here, so the person can pick one; none is picked for them. `hide` is one being forgotten. */
function SavedPcs({ hide }: { hide: string | null }) {
    const t = useT();
    const [pcs, setPcs] = useState<PairedPc[]>([]);
    const [using, setUsing] = useState<string | null>(null);
    const [error, setError] = useState<ShownError>(null);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        getPairingService()
            .list()
            .then((list) => alive.current && setPcs(list))
            .catch((e: unknown) => alive.current && setError(describeHttpFailure(e, t)));
        return () => {
            alive.current = false;
        };
    }, [t]);
    const shown = pcs.filter((pc) => pc.id !== hide);
    if (shown.length === 0 && !error) return null;
    const use = (pc: PairedPc) => {
        setError(null);
        setUsing(pc.id);
        switchToPc(pc).catch((e: unknown) => {
            if (!alive.current) return;
            setUsing(null);
            setError(describeHttpFailure(e, t));
        });
    };
    return (
        <Stack gap="sm" testID="pairing-saved-pcs">
            <Text role="label" tone="muted">{t('mobileApp.pairing.pcs.title')}</Text>
            {shown.map((pc) => (
                <Row key={pc.id} gap="md">
                    <Stack flex={1}>
                        <Text role="body">{pc.name}</Text>
                    </Stack>
                    <Button size="sm" label={t('mobileApp.pairing.pcs.use')} onPress={() => use(pc)} busy={using === pc.id} testID={`pairing-use-${pc.id}`} />
                </Row>
            ))}
            {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
        </Stack>
    );
}

/** Design's explainer before iOS's local network prompt; Continue makes the connection that raises it, so there is no skip. */
export function LocalNetworkExplainer({ onContinue, busy, error }: { onContinue: () => void; busy?: boolean; error?: ShownError }) {
    const t = useT();
    return (
        <Page
            icon={Wifi}
            iconSize="xl"
            title={t('mobileApp.localNetwork.title')}
            body={t('mobileApp.localNetwork.body')}
            footer={<Button variant="primary" label={t('mobileApp.localNetwork.continue')} onPress={onContinue} busy={busy} full testID="local-network-continue" />}
        >
            <Text role="body" tone="muted" align="center">
                {t('mobileApp.localNetwork.privacy')}
            </Text>
            <Text role="body" tone="muted" align="center">
                {t('mobileApp.localNetwork.next')}
            </Text>
            {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
        </Page>
    );
}

/** In place of "can't reach your PC" when the phone's local network setting looks off for GAIA; Back goes to how to pair. */
export function LocalNetworkDenied({ onBack, busy, error }: { onBack: () => void; busy?: boolean; error?: ShownError }) {
    const t = useT();
    const open = () => {
        Linking.openSettings().catch((e: unknown) => console.error("Couldn't open this app's page in the phone's Settings", e));
    };
    return (
        <Page icon={CircleAlert} title={t('mobileApp.localNetwork.deniedTitle')} body={t('mobileApp.localNetwork.deniedBody')}>
            <Button variant="primary" label={t('mobileApp.localNetwork.openSettings')} onPress={open} busy={busy} full testID="local-network-settings" />
            <Button variant="secondary" label={t('mobileApp.pairing.manual.back')} onPress={onBack} disabled={busy} full testID="local-network-back" />
            {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
        </Page>
    );
}

function Page({
    icon,
    iconSize = 'lg',
    title,
    body,
    busy,
    footer,
    up,
    notice,
    children,
}: {
    icon?: typeof Clock;
    iconSize?: 'lg' | 'xl';
    title: string;
    body?: string;
    busy?: boolean;
    /** Actions pinned to the bottom of the screen, in thumb reach. */
    footer?: React.ReactNode;
    /** A leading up control in a bare top bar, for a screen opened from another one. */
    up?: React.ReactNode;
    /** Above everything else on the page. */
    notice?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <Screen
            width="flow"
            banner={null}
            keyboard="avoid"
            scroll
            header={up ? <Stack paddingX="lg" paddingY="sm"><Row>{up}</Row></Stack> : undefined}
            footer={
                footer ? (
                    <Stack gap="sm">
                        {footer}
                    </Stack>
                ) : undefined
            }
        >
            <Stack flex={1} gap="lg" padding="xl" justify="center" width="100%" testID="pairing-page">
                {notice}
                {icon ? (
                    <Stack align="center">
                        <Icon icon={icon} size={iconSize} tone="accent" />
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
