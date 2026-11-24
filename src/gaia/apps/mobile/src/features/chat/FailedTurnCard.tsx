// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { describeFailedTurn, failedTurnDetails, type FailedTurn } from '@webui/utils/failedTurn';

import { useT } from '@/i18n/useT';
import { openSettings } from '@/features/settings/openSettings';
import { isSectionId, type SectionId } from '@/features/settings/sections';
import { Button, Disclosure, Ltr, Stack, Text } from '@/ui';
import { Settings } from '@/ui/icons';

/** The desktop's `[data-settings-target="x"]` selector, as the phone's anchor name. */
export const targetName = (selector: string | undefined): string | undefined => selector?.match(/data-settings-target="([^"]+)"/)?.[1];

/** How a failed reply's saved text is classified, with the same rules as the desktop card. */
export function failedTurnOf(content: string): FailedTurn {
    return describeFailedTurn(content);
}

/** The banner title for a cause; null for an unclassified failure, which keeps "Something went wrong". */
export function causeTitleKey(turn: FailedTurn) {
    return turn.kind === 'unknown' ? null : (`failedTurn.${turn.kind}.title` as const);
}

/** What a failed reply says in place of the server's text: the cause in plain words, the server's words under Details. */
export function FailedLead({ turn, content }: { turn: FailedTurn; content: string }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    return (
        <Stack gap="xs" testID="failed-lead">
            <Text role="body">{t(`failedTurn.${turn.kind}.body`)}</Text>
            <Disclosure title={t('failedTurn.details')} open={open} onToggle={() => setOpen((v) => !v)} headerTestID="failed-details-toggle">
                <Text role="caption" tone="muted" selectable testID="failed-details-text">
                    <Ltr>{failedTurnDetails(content)}</Ltr>
                </Text>
            </Disclosure>
        </Stack>
    );
}

/** One "Open Settings › {tab}" button per tab the fix lives on. */
export function OpenSettingsButtons({ turn }: { turn: FailedTurn }) {
    const t = useT();
    const sections = turn.sections.filter((s): s is SectionId => isSectionId(s));
    if (sections.length === 0) return null;
    return (
        <Stack gap="sm" align="start">
            {sections.map((section) => (
                <Button
                    key={section}
                    size="sm"
                    variant="secondary"
                    icon={Settings}
                    label={t.compose((say) => say('failedTurn.openSettings', { tab: say(`settings.section.${section}`) }))}
                    onPress={() => openSettings(section, targetName(turn.targets[section]))}
                    testID={`open-settings-${section}`}
                />
            ))}
        </Stack>
    );
}
