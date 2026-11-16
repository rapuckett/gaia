// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useLocalModelStatus } from '@/data';
import { useT } from '@/i18n/useT';
import { FirstLine, Icon, Pressable, Row, Stack, StatusDot, Text, type StatusTone } from '@/ui';
import { useLargeText } from '@/ui/theme/a11y';
import { Cloud, Cpu } from '@/ui/icons';

import { ModelStatusSheet } from './ModelStatusSheet';
import { pillText, type ModelDot } from './modelStatusText';

const DOT_TONE: Record<ModelDot, StatusTone> = {
    loaded: 'success',
    warming: 'running',
    idle: 'idle',
    stopped: 'error',
};

export interface ModelStatusPillProps {
    /** Opens the app's model settings; the sheet shows a link only when this is given. */
    onOpenSettings?: () => void;
}

/** The model and its state at a glance; opens the status sheet. Mount it in the chat list's footer. */
export function ModelStatusPill({ onOpenSettings }: ModelStatusPillProps) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const { data } = useLocalModelStatus(open);
    const pill = pillText(data, t);
    const place = !pill.remote && pill.name ? t('mobileApp.model.onYourPc') : null;
    const largeText = useLargeText();
    const firstRole = place ? 'caption' : 'label';
    return (
        <>
            <Stack paddingX="lg" paddingY="sm">
                <Pressable accessibilityLabel={pill.aria} onPress={() => setOpen(true)} testID="model-status-pill">
                    <Row gap="sm" align={largeText ? 'start' : 'center'}>
                        <FirstLine role={firstRole}>
                            <Icon icon={pill.remote ? Cloud : Cpu} size="sm" tone="secondary" />
                        </FirstLine>
                        <Stack flex={1}>
                            {place ? <Text role="caption" tone="muted" numberOfLines={1}>{place}</Text> : null}
                            <Text role="label" tone="secondary" numberOfLines={1} dir={pill.name ? 'ltr' : 'auto'}>
                                {pill.name ?? pill.text}
                            </Text>
                        </Stack>
                        {data && !pill.remote ? (
                            <FirstLine role={firstRole}>
                                <StatusDot solid tone={DOT_TONE[data.state]} label={t(`modelStatus.state.${data.state}`)} />
                            </FirstLine>
                        ) : null}
                    </Row>
                </Pressable>
            </Stack>
            <ModelStatusSheet open={open} onClose={() => setOpen(false)} onOpenSettings={onOpenSettings} />
        </>
    );
}
