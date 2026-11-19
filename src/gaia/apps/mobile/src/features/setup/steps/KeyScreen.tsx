// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ltrIn } from '@webui/components/setup/format';
import { FIREWORKS_KEYS_URL, GATEWAY_GUIDE_URL } from '@webui/components/setup/keyLinks';
import type { CloudPriceList } from '@webui/types';
import { useEffect, useRef, useState } from 'react';

import { GaiaApiError } from '@/api/errors';
import { useActiveModel, useCloudPrices, useCloudProviders, useConnectCloud, useLemonadeTarget, useSendProviderKey } from '@/data';
import { describeHttpFailure, technicalDetail, useLocaleCode, useT, type Translate } from '@/i18n/useT';
import { openLinkFromPress } from '@/platform/openLink';
import { Button, Card, ChoiceList, Notice, Spinner, Stack, Row, Text, TextField, type ChoiceOption } from '@/ui';

import { shortModelName } from '../../new-chat/warmUp';
import { SetupFooter } from '../SetupFooter';
import { formatPrice } from './cloudPrice';
import type { PlanScreen } from './planScreens';

type Provider = 'fireworks' | 'amd';

const PROVIDERS: { id: Provider; title: string; note: 'setup.where.fireworksNote' | 'setup.where.amdNote' }[] = [
    { id: 'fireworks', title: 'Fireworks AI', note: 'setup.where.fireworksNote' },
    { id: 'amd', title: 'AMD LLM Gateway', note: 'setup.where.amdNote' },
];

/** The rows shown as choices: the top three, and the model in use when it ranks lower. */
function shownRows(list: CloudPriceList, inUse: string | null) {
    const top = list.models.slice(0, 3);
    const extra = inUse && !top.some((m) => m.model === inUse) ? list.models.find((m) => m.model === inUse) : undefined;
    return extra ? [...top, extra] : top;
}

function openLink(url: string) {
    openLinkFromPress(url);
}

function Prices({ provider, picked, onPick, disabled, inUse }: {
    provider: Provider;
    picked: string | null;
    onPick: (model: string) => void;
    disabled: boolean;
    inUse: string | null;
}) {
    const t = useT();
    const locale = useLocaleCode();
    const prices = useCloudPrices(provider, true);
    if (prices.error) {
        return <Notice tone="danger" message={t('mobileApp.error.pricesFailed')} detail={technicalDetail(prices.error)} />;
    }
    const list = prices.data;
    if (!list) {
        return (
            <Row gap="sm">
                <Spinner size="sm" />
                <Text role="caption" tone="secondary">{t('settings.price.loading')}</Text>
            </Row>
        );
    }
    if (list.models.length === 0) {
        return <Text role="caption" tone="secondary">{`${t('settings.price.unknownSentence')} ${list.note ?? ''}`}</Text>;
    }
    const rows = shownRows(list, inUse);
    const chosen = picked ?? rows[0]?.model;
    const options: ChoiceOption[] = rows.map((m, i) => ({
        value: m.model,
        label: ltrIn(locale, m.name) + (i === 0 ? ` · ${t('settings.price.default')}` : ''),
        description: [m.note, ltrIn(locale, formatPrice(m.price, t))].filter(Boolean).join(' · '),
    }));
    return (
        <Stack gap="sm" testID="key-prices">
            <Text role="label" weight="semibold">{t('settings.price.pickLegend')}</Text>
            <ChoiceList options={options} value={chosen} onChange={disabled ? () => undefined : onPick} accessibilityLabel={t('settings.model.prices')} />
            <Text role="caption" tone="secondary">{t('settings.price.payProvider')}</Text>
            {list.source ? <Text role="caption" tone="muted" dir="ltr">{list.source}</Text> : null}
        </Stack>
    );
}

function GetAKey({ provider }: { provider: Provider }) {
    const t = useT();
    if (provider === 'amd') {
        return <Button variant="ghost" label={t('setup.key.gatewayHelp')} onPress={() => openLink(GATEWAY_GUIDE_URL)} />;
    }
    return (
        <Card>
            <Stack gap="sm">
                <Text role="ui" weight="medium">{t('setup.key.getOne')}</Text>
                <Button variant="ghost" wrap label={t('setup.key.step1')} onPress={() => openLink(FIREWORKS_KEYS_URL)} />
                <Text role="label" tone="secondary">{t('setup.key.step2')}</Text>
                <Text role="label" tone="secondary">{t('setup.key.step3')}</Text>
            </Stack>
        </Card>
    );
}

function refusedByPc(error: unknown): boolean {
    return error instanceof GaiaApiError && error.status === 403;
}

function ConnectError({ error, t }: { error: unknown; t: Translate }) {
    if (refusedByPc(error)) return <Notice tone="info" message={t('setup.plan.pcOnly')} testID="key-pc-only" />;
    return <Notice tone="danger" message={describeHttpFailure(error, t).text} detail={describeHttpFailure(error, t).detail} />;
}

/**
 * Connect a cloud provider with a key typed here, or with the one the PC already holds, and setup goes on
 * to the run. The key lives only in its field until sent, and the field clears on every send. When the PC
 * refuses a typed key from this phone (403), the field turns read-only with "Change this on the PC".
 */
export const KeyScreen: PlanScreen = ({ ctx, close }) => {
    const t = useT();
    const providers = useCloudProviders();
    const usersServer = useLemonadeTarget().data?.source === 'config';
    const connect = useConnectCloud();
    const sendKey = useSendProviderKey();
    const [key, setKey] = useState('');
    const [keyError, setKeyError] = useState<unknown>(null);
    const [chosen, setChosen] = useState<Provider | null>(null);
    const [picked, setPicked] = useState<string | null>(null);

    const infoOf = (id: Provider) => providers.data?.providers.find((p) => p.id === id);
    const active = useActiveModel().data;
    const choice: Provider = chosen ?? (active?.provider === 'amd' ? 'amd' : 'fireworks');
    const info = infoOf(choice);
    const blocked = (id: Provider) => !!infoOf(id)?.blocked;
    const gatewayDown = infoOf('amd')?.network?.reachable === false;
    // The gateway is for AMD's network: hidden once it is known not to answer, unless already chosen.
    const gatewayShown = !gatewayDown || choice === 'amd';
    const unavailable = (id: Provider) => blocked(id) || (id === 'amd' && gatewayDown);
    const connected = !!info?.configured;
    const keyRefused = refusedByPc(keyError) || refusedByPc(connect.error);
    const busy = connect.isPending || sendKey.isPending;
    const canConnect = (connected || usersServer || !!key.trim()) && !unavailable(choice);
    const inUse = active?.provider === choice ? active.model : null;
    const shownPick = picked ?? inUse;

    const options: ChoiceOption[] = PROVIDERS.filter((p) => p.id !== 'amd' || gatewayShown).map((p) => ({
        value: p.id,
        label: p.title,
        description: blocked(p.id) ? t('settings.privacy.localOnlyBlocked') : unavailable(p.id) ? t('setup.key.gatewayOff') : t(p.note),
    }));

    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const go = () => {
        const typed = usersServer ? '' : key.trim();
        setKey('');
        setKeyError(null);
        connect.reset();
        const run = (keySent: boolean) =>
            connect.mutate(
                { provider: choice, wanted: shownPick, wantedName: shownPick ? shortModelName(shownPick) : undefined, keySent },
                { onSuccess: () => ctx.startedRun() },
            );
        if (!typed) return run(false);
        sendKey.send(choice, typed, { onWaiting: () => undefined, stopped: () => !mounted.current }).then(
            () => mounted.current && run(true),
            (err: unknown) => mounted.current && setKeyError(err),
        );
    };

    return (
        <Stack gap="md" testID="key-screen">
            <Text role="title" weight="semibold" accessibilityRole="header">{t('setup.key.title')}</Text>
            {providers.error ? <Notice tone="danger" message={describeHttpFailure(providers.error, t).text} detail={describeHttpFailure(providers.error, t).detail} /> : null}
            <ChoiceList
                options={options}
                value={choice}
                accessibilityLabel={t('setup.key.provider')}
                onChange={(v) => {
                    if (busy || unavailable(v as Provider)) return;
                    setChosen(v as Provider);
                    setPicked(null);
                    setKey('');
                    setKeyError(null);
                    connect.reset();
                }}
            />
            {gatewayDown && gatewayShown ? (
                <Button variant="ghost" label={t('setup.key.checkAgain')} disabled={providers.isFetching} onPress={() => void providers.refetch()} />
            ) : null}
            {blocked(choice) ? (
                <Notice tone="warning" message={t('settings.privacy.localOnlyBlocked')} />
            ) : (
                <>
                    {usersServer ? null : <GetAKey provider={choice} />}
                    <Text role="caption" tone="muted">{t('setup.models.cloudNote')}</Text>
                    <Prices provider={choice} picked={shownPick} onPick={setPicked} disabled={busy} inUse={inUse} />
                </>
            )}
            {usersServer ? null : (
                <Stack gap="xs">
                    <TextField
                        label={t('setup.key.labelFor', { provider: PROVIDERS.find((p) => p.id === choice)?.title ?? '' })}
                        value={key}
                        onChangeText={setKey}
                        placeholder={connected ? t.bare('setup.key.placeholder') : t.bare('setup.key.placeholderNew')}
                        accessibilityHint={connected ? t('setup.key.placeholder') : t('setup.key.placeholderNew')}
                        secret
                        disabled={keyRefused || busy}
                        testID="key-field"
                    />
                </Stack>
            )}
            <Text role="caption" tone="secondary">{usersServer ? t('setup.key.usersServer') : t('setup.key.where')}</Text>
            {busy ? <Text role="caption" tone="secondary">{t('setup.key.testing')}</Text> : null}
            {keyError ? <ConnectError error={keyError} t={t} /> : connect.error ? <ConnectError error={connect.error} t={t} /> : null}
            <SetupFooter>
                <Button variant="secondary" label={t('setup.back')} disabled={busy} onPress={close} />
                <Button
                    variant="primary"
                    label={t('setup.key.connect')}
                    busy={busy}
                    disabled={ctx.locked || busy || !canConnect}
                    onPress={go}
                />
            </SetupFooter>
        </Stack>
    );
};
