// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { keepTogether } from '@webui/i18n/registry';
import { useState } from 'react';

import { DEVICE_CHANGES_KEPT, useDeviceChanges } from '@/data';
import type { DeviceChange } from '@/api/client.types';
import { describeHttpFailure, useLocaleCode, useT } from '@/i18n/useT';
import { relativeTime } from '@/features/notifications/notificationText';
import { Button, Disclosure, ListSkeleton, Notice, Sheet, Stack, Text } from '@/ui';

import { changeText } from './changeText';

/** The newest rows shown inline; the rest open in a sheet. */
export const CHANGES_SHOWN = 20;

function ChangeRow({ change, now, index }: { change: DeviceChange; now: number; index: number }) {
    const t = useT();
    const locale = useLocaleCode();
    const { title, detail } = changeText(change, t);
    const at = Date.parse(change.at);
    return (
        <Stack gap="xs" testID={`device-change-${index}`}>
            <Text role="ui">{title}</Text>
            {Number.isNaN(at) ? null : (
                <Text role="caption" tone="muted">
                    {relativeTime(at, now, t, locale)}
                </Text>
            )}
            {detail ? (
                <Text role="caption" tone="muted" dir="ltr">
                    {detail}
                </Text>
            ) : null}
        </Stack>
    );
}

function ChangeRows({ changes }: { changes: readonly DeviceChange[] }) {
    const [now] = useState(() => Date.now());
    return (
        <Stack gap="md">
            {changes.map((change, index) => (
                <ChangeRow key={change.id} change={change} now={now} index={index} />
            ))}
        </Stack>
    );
}

/** What this phone changed on the PC it is connected to: collapsed, loaded when opened, read-only. */
export function ChangesFromThisPhone({ deviceId, pcName, initial = 'closed' }: { deviceId: string; pcName: string; /** For dev scenes: start with the list open, or with the full list's sheet too. */ initial?: 'closed' | 'open' | 'all' }) {
    const t = useT();
    const [open, setOpen] = useState(initial !== 'closed');
    const [all, setAll] = useState(initial === 'all');
    const recent = useDeviceChanges(deviceId, CHANGES_SHOWN, open);
    const full = useDeviceChanges(deviceId, DEVICE_CHANGES_KEPT, all);
    const total = recent.data?.total ?? 0;
    const failure = recent.error ? describeHttpFailure(recent.error, t) : null;

    return (
        <Stack paddingX="lg">
            <Disclosure
                title={t('mobileApp.devices.changesTitle')}
                hint={t('mobileApp.devices.changesOn', { pc: keepTogether(pcName) })}
                open={open}
                onToggle={() => setOpen((v) => !v)}
                testID="device-changes"
                headerTestID="device-changes-toggle"
            >
                <Stack gap="md" paddingY="sm">
                    {recent.isPending && open ? <ListSkeleton rows={2} /> : null}
                    {failure ? (
                        <Notice
                            tone="warning"
                            message={failure.text}
                            detail={failure.detail}
                            action={{ label: t('msg.tryAgain'), onPress: () => void recent.refetch() }}
                        />
                    ) : null}
                    {recent.data && recent.data.changes.length === 0 ? <Text tone="secondary">{t('settings.devices.changesNone')}</Text> : null}
                    {recent.data ? <ChangeRows changes={recent.data.changes.slice(0, CHANGES_SHOWN)} /> : null}
                    {recent.data && total > CHANGES_SHOWN ? (
                        <Button label={t('settings.devices.changesShowAll')} variant="secondary" onPress={() => setAll(true)} testID="device-changes-show-all" />
                    ) : null}
                </Stack>
            </Disclosure>
            <Sheet open={all} onClose={() => setAll(false)} title={t('mobileApp.devices.changesTitle')}>
                <Stack gap="md">
                    {full.isPending ? <ListSkeleton rows={4} /> : null}
                    {full.error ? (
                        <Notice
                            tone="warning"
                            message={describeHttpFailure(full.error, t).text}
                            detail={describeHttpFailure(full.error, t).detail}
                            action={{ label: t('msg.tryAgain'), onPress: () => void full.refetch() }}
                        />
                    ) : null}
                    {full.data ? <ChangeRows changes={full.data.changes} /> : null}
                </Stack>
            </Sheet>
        </Stack>
    );
}
