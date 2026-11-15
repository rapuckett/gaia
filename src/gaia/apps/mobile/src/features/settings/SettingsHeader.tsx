// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import { IconButton, Row, Stack, Text } from '@/ui';
import { ArrowLeft } from '@/ui/icons';

/** The settings header: back (when given), the title, and actions at the end. */
export function SettingsHeader({ title, backLabel, onBack, end }: { title: string; backLabel?: string; onBack?: () => void; end?: ReactNode }) {
    return (
        <Stack paddingX="lg" paddingY="sm">
            <Row gap="sm" accessibilityRole="header">
                {onBack && backLabel ? <IconButton icon={ArrowLeft} label={backLabel} onPress={onBack} /> : null}
                <Stack flex={1}>
                    <Text role="title" weight="semibold" numberOfLines={1}>{title}</Text>
                </Stack>
                {end}
            </Row>
        </Stack>
    );
}
