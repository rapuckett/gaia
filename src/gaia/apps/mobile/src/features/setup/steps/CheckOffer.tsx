// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useState } from 'react';

import { ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { useSetLemonadeTarget, useSwitchToYourServer } from '@/data';
import { ActionError, SwitchError } from '@/features/settings/panes/advanced/errors';
import { OwnServerConfirm } from '@/features/settings/panes/advanced/OwnServerConfirm';
import { describeError, useT } from '@/i18n/useT';
import { Badge, Button, Disclosure, Ltr, Pressable, Row, Spinner, Stack, Surface, Text, TextField } from '@/ui';

import { SetupFooter } from '../SetupFooter';
import type { OfferState } from './offerState';

type Found = Extract<OfferState, { kind: 'offer' }>['found'];
type Mode = 'gaia' | 'external';

/** Dev gallery only: the offer opens with this picked and typed, and the confirm sheet up when `confirming`. */
export const SeedOffer = createContext<{ pick: Mode; key?: string; confirming?: boolean } | null>(null);

const OPTIONS = [
    { mode: 'gaia' as const, title: 'setup.offer.useOwn' as const, note: 'setup.offer.ownNote' as const },
    { mode: 'external' as const, title: 'setup.offer.useMine' as const, note: 'setup.offer.mineNote' as const },
];

/** A radio card: the choice's name, GAIA's own marked Recommended, and what it means below. */
function Choice({ option, picked, disabled, onPick }: { option: (typeof OPTIONS)[number]; picked: boolean; disabled: boolean; onPick: () => void }) {
    const t = useT();
    return (
        <Pressable onPress={onPick} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`${t(option.title)}. ${t(option.note)}`} aria-checked={picked} testID={`offer-${option.mode}`}>
            <Surface tone={picked ? 'accent' : 'card'} border={picked ? 'accent' : true} radius="md" padding="md">
                <Row gap="sm" align="start">
                    <Text tone={picked ? 'accent' : 'muted'}>{picked ? '\u25CF' : '\u25CB'}</Text>
                    <Stack gap="xs" flex={1}>
                        <Row gap="sm" wrap align="center">
                            <Text role="ui" weight="semibold">{t(option.title)}</Text>
                            {option.mode === 'gaia' ? <Badge tone="accent" label={t.bare('setup.offer.recommended')} accessibilityLabel={t('setup.offer.recommended')} /> : null}
                        </Row>
                        <Text role="label" tone="secondary">{t(option.note)}</Text>
                    </Stack>
                </Row>
            </Surface>
        </Pressable>
    );
}

/**
 * The choice between GAIA's own server and the one the PC already runs. GAIA's own is picked at first; "Use the one
 * I have" asks on a sheet before Continue sends it, as the PC requires of a phone.
 */
function Choices({ found, needsKey }: { found: Found; needsKey: boolean }) {
    const t = useT();
    const seed = useContext(SeedOffer);
    const refused = useDeviceRefused('POST', ENDPOINTS.lemonadeTarget);
    const useOwn = useSetLemonadeTarget();
    const useYours = useSwitchToYourServer();
    const [pick, setPick] = useState<Mode>(seed?.pick ?? 'gaia');
    const [key, setKey] = useState(seed?.key ?? '');
    const [more, setMore] = useState(false);
    const [confirming, setConfirming] = useState(!!seed?.confirming);
    const [error, setError] = useState<unknown>(null);
    const busy = useOwn.isPending || useYours.isPending;
    const keyMissing = pick === 'external' && needsKey && !key.trim();

    const choose = (mode: Mode) => {
        setPick(mode);
        setError(null);
        useOwn.reset();
    };
    const sendYours = () => {
        setConfirming(false);
        const typedKey = key;
        setKey('');
        setError(null);
        useYours.send(found.url, typedKey).catch((err: unknown) => setError(err));
    };

    return (
        <Surface tone="card" border="accent" radius="lg" padding="lg">
            <Stack gap="md">
                <Text role="ui" weight="semibold" accessibilityRole="header">{t('setup.offer.title')}</Text>
                <Stack gap="sm" accessibilityLabel={t('setup.offer.label')}>
                    {OPTIONS.map((o) => (
                        <Choice key={o.mode} option={o} picked={pick === o.mode} disabled={busy || refused} onPick={() => choose(o.mode)} />
                    ))}
                </Stack>
                <Disclosure title={t('setup.offer.whatGaiaDoes')} open={more} onToggle={() => setMore((m) => !m)}>
                    <Stack gap="xs">
                        <Ltr>{`Lemonade${found.version ? ` ${found.version}` : ''} · ${found.url}`}</Ltr>
                        <Text role="caption" tone="secondary">{t('setup.offer.whatGaiaDoesText')}</Text>
                    </Stack>
                </Disclosure>
                {pick === 'external' && needsKey && !refused ? (
                    <TextField
                        value={key}
                        onChangeText={setKey}
                        label={t('setup.offer.keyLabel')}
                        placeholder={t.bare('setup.offer.keyPlaceholder')}
                        accessibilityHint={t('setup.offer.keyPlaceholder')}
                        secret
                        disabled={busy}
                        testID="offer-key"
                    />
                ) : null}
                {error ? <SwitchError error={error} /> : null}
                {useOwn.isError ? <ActionError error={useOwn.error} /> : null}
                {refused ? <Text role="caption" tone="secondary">{t('setup.check.pcOnly')}</Text> : null}
            </Stack>
            {refused ? null : (
                <SetupFooter>
                    <Button
                        label={t('setup.continue')}
                        variant="primary"
                        busy={busy}
                        disabled={busy || keyMissing}
                        onPress={() => (pick === 'gaia' ? useOwn.mutate({ mode: 'gaia' }) : setConfirming(true))}
                        testID="offer-continue"
                    />
                </SetupFooter>
            )}
            <OwnServerConfirm url={found.url} open={confirming} onClose={() => setConfirming(false)} onConfirm={sendYours} />
        </Surface>
    );
}

/** "This PC already runs a model server": looking, the offer, what the PC chose, or why it couldn't tell. */
export function CheckOffer({ state }: { state: OfferState }) {
    const t = useT();
    const [details, setDetails] = useState(false);
    switch (state.kind) {
        case 'looking':
            return (
                <Row gap="sm" align="center">
                    <Spinner />
                    <Text role="caption" tone="secondary" accessibilityRole="summary">{t('setup.offer.looking')}</Text>
                </Row>
            );
        case 'error':
            return (
                <Stack gap="sm">
                    <Text tone="secondary">{t('setup.offer.checkFailed')}</Text>
                    <Disclosure title={t('setup.progress.details')} open={details} onToggle={() => setDetails((d) => !d)}>
                        <Ltr>{describeError(state.error, t)}</Ltr>
                    </Disclosure>
                </Stack>
            );
        case 'noAnswer':
            return <Text tone="secondary">{t('setup.offer.noAnswer', { url: state.urls.join(', ') })}</Text>;
        case 'tooOld':
            return (
                <Stack gap="xs">
                    <Text tone="secondary" accessibilityRole="summary">{t('setup.offer.tooOld')}</Text>
                    <Ltr>{`Lemonade ${state.found.version ?? ''} · ${state.found.url}`}</Ltr>
                </Stack>
            );
        case 'offer':
            return <Choices found={state.found} needsKey={state.needsKey} />;
        case 'chosen':
            return (
                <Text tone="secondary" accessibilityRole="summary">
                    {state.mode === 'external'
                        ? t('setup.offer.usingYours', { url: state.url ?? '' })
                        : t('setup.offer.usingOwn')}
                </Text>
            );
        default:
            return null;
    }
}
