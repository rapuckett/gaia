// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useState } from 'react';

import { isolateUnit, type MessageKey } from '@webui/i18n/registry';

import type { Automation } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { useAutomationAction, useAutomations, useDeleteAutomation, useQueryFailure } from '@/data';
import { composeDateLocale } from '@/features/schedules/scheduleText';
import { technicalDetail, useT, type Translate } from '@/i18n/useT';
import { Badge, Button, Card, Notice, Row, Spinner, Stack, Text } from '@/ui';

import { ConfirmSheet } from '../../setup/sheets/ConfirmSheet';
import { openSettings } from '../openSettings';
import { isPcRefusal, PcOnlyNotice } from '../PcOnlyNotice';
import { SettingsAnchor } from '../targets';
import { daysPhrase, everyPhrase, formatWhen } from './automationText';

/** Dev gallery only: opens the pane already asking to remove this automation (by id). */
export const SeedAutomationRemove = createContext<string | null>(null);

/** The PC's own words for a failure, for the muted detail line under our sentence. */
function failureDetail(error: unknown): string {
    return error instanceof GaiaApiError ? error.detail : technicalDetail(error);
}

function kindKey(item: Automation): MessageKey {
    return item.heartbeat ? 'settings.automations.kind.heartbeat' : (`settings.automations.kind.${item.kind}` as MessageKey);
}

function WhenLine({ item, t }: { item: Automation; t: Translate }) {
    const at = (key: MessageKey) => t.compose((say, code) => `${say(key)} ${formatWhen(item.next_at, composeDateLocale(code, t))}`);
    const parts: string[] = [];
    if (item.every_seconds > 0) {
        if (everyPhrase(item.every_seconds, t, t.locale) !== null) {
            parts.push(t.compose((say, code) => everyPhrase(item.every_seconds, say, code) ?? ''));
        }
        if (!item.paused) parts.push(at('settings.automations.next'));
    } else {
        parts.push(at('settings.automations.once'));
    }
    if (item.quiet) parts.push(t.compose((say) => `${say('settings.automations.quiet')} ${isolateUnit(item.quiet)}`));
    if (item.days) parts.push(t.compose((say) => `${say('settings.automations.days')} ${daysPhrase(item.days, say)}`));
    return (
        <Row gap="md" wrap>
            {parts.map((part) => (
                <Text key={part} role="label" tone="muted">
                    {part}
                </Text>
            ))}
        </Row>
    );
}

function AutomationCard({ item, busy, onToggle, onRemove }: { item: Automation; busy: boolean; onToggle: () => void; onRemove: () => void }) {
    const t = useT();
    const detail = item.say || item.prompt;
    return (
        <Card padding="md" testID={`automation-${item.id}`}>
            <Stack gap="sm">
                <Row gap="sm" wrap>
                    <Text role="ui" weight="semibold" tone={item.paused ? 'secondary' : 'primary'} accessibilityRole="header">
                        {isolateUnit(item.name)}
                    </Text>
                    <Badge shape="pill" label={t.bare(kindKey(item))} accessibilityLabel={t(kindKey(item))} />
                    {item.paused ? (
                        <Badge shape="pill" tone="warning" label={t.bare('settings.automations.paused')} accessibilityLabel={t('settings.automations.paused')} />
                    ) : null}
                </Row>
                <WhenLine item={item} t={t} />
                {detail ? (
                    <Text role="label" tone={item.paused ? 'secondary' : 'primary'} dir="auto" numberOfLines={3}>
                        {detail}
                    </Text>
                ) : null}
                {item.check ? (
                    <Stack gap="xs">
                        <Text role="label" tone="muted">
                            {t('settings.automations.check')}
                        </Text>
                        <Text role="caption" tone="muted" dir="ltr" mono>
                            {item.check}
                        </Text>
                    </Stack>
                ) : null}
                {item.failures > 0 ? (
                    <Text role="label" tone="danger">
                        {t.plural('settings.automations.failing', item.failures)}
                    </Text>
                ) : null}
                <Row gap="sm" wrap>
                    <Button
                        variant="secondary"
                        label={t(item.paused ? 'settings.automations.resume' : 'settings.automations.pause')}
                        busy={busy}
                        disabled={busy}
                        onPress={onToggle}
                        testID={`automation-toggle-${item.id}`}
                    />
                    <Button variant="danger" label={t('settings.automations.remove')} disabled={busy} onPress={onRemove} testID={`automation-remove-${item.id}`} />
                </Row>
            </Stack>
        </Card>
    );
}

/** Settings > Automations: see, pause, resume and remove what GAIA runs on its own, as the desktop does. */
export default function Automations() {
    const t = useT();
    const query = useAutomations();
    const failure = useQueryFailure(query);
    const action = useAutomationAction();
    const remove = useDeleteAutomation();
    const seeded = useContext(SeedAutomationRemove);
    // The item stays while the sheet slides out, so its title doesn't blank.
    const [confirmItem, setConfirmItem] = useState<Automation | null>(null);
    const [open, setOpen] = useState(seeded !== null);
    const [actionError, setActionError] = useState<unknown>(null);
    const list = query.data;
    const items = list?.automations ?? [];
    const shown = confirmItem ?? (seeded ? (items.find((a) => a.id === seeded) ?? null) : null);

    const busyId = action.isPending ? action.variables?.ref : remove.isPending ? remove.variables : undefined;
    const callbacks = { onSuccess: () => setActionError(null), onError: (error: Error) => setActionError(error) };

    const ask = (item: Automation) => {
        setConfirmItem(item);
        setOpen(true);
    };
    const removeConfirmed = () => {
        if (!shown) return;
        setConfirmItem(shown);
        setOpen(false);
        remove.mutate(shown.id, callbacks);
    };

    return (
        <SettingsAnchor name="pane">
            <Stack gap="md" padding="lg">
                <Text role="ui" tone="secondary">
                    {t('settings.automations.lede')}
                </Text>
                {query.isPending && !failure.failed ? (
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Text role="label" tone="muted">
                            {t('settings.loading')}
                        </Text>
                    </Row>
                ) : null}
                {failure.failed && isPcRefusal(failure.error) ? <PcOnlyNotice testID="automations-pc-only" /> : null}
                {failure.failed && !isPcRefusal(failure.error) ? (
                    <Notice
                        tone="danger"
                        message={t('mobileApp.settings.automations.loadFailed')}
                        detail={failureDetail(failure.error)}
                        action={{ label: t('settings.automations.retry'), onPress: () => void query.refetch() }}
                        testID="automations-load-failed"
                    />
                ) : null}
                {list && list.delivers === null && items.length > 0 ? (
                    <Text role="label" tone="muted" testID="automations-delivery-unknown">
                        {t('settings.automations.deliveryUnknown')}
                    </Text>
                ) : null}
                {list && list.delivers === false && items.length > 0 ? (
                    <Notice
                        tone="warning"
                        message={t('settings.automations.noDelivery')}
                        action={{ label: t('settings.automations.openMessaging'), onPress: () => openSettings('messaging', undefined, 'automations') }}
                        testID="automations-no-delivery"
                    />
                ) : null}
                {actionError ? (
                    <Notice
                        tone="danger"
                        message={t('mobileApp.settings.automations.actionFailed')}
                        detail={failureDetail(actionError)}
                        onDismiss={() => setActionError(null)}
                        testID="automations-action-failed"
                    />
                ) : null}
                {list && items.length === 0 ? (
                    <Text role="ui" tone="muted" testID="automations-empty">
                        {t('settings.automations.empty')}
                    </Text>
                ) : null}
                {items.map((item) => (
                    <AutomationCard
                        key={item.id}
                        item={item}
                        busy={busyId === item.id}
                        onToggle={() => action.mutate({ ref: item.id, action: item.paused ? 'resume' : 'pause' }, callbacks)}
                        onRemove={() => ask(item)}
                    />
                ))}
            </Stack>
            <ConfirmSheet
                open={open && shown !== null}
                title={t('settings.automations.removeTitle', { name: isolateUnit(shown?.name ?? '') })}
                body={[t('settings.automations.removeBody')]}
                confirmLabel={t('settings.automations.remove')}
                cancelLabel={t('settings.automations.cancel')}
                danger
                onConfirm={removeConfirmed}
                onCancel={() => setOpen(false)}
            />
        </SettingsAnchor>
    );
}
