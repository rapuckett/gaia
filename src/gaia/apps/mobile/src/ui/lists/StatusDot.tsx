// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import { Row } from '../layout/layout';
import { Icon } from '../controls/Icon';
import { Check, CircleAlert, TriangleAlert } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';
import { Pulse } from './Pulse';

export type StatusTone = 'idle' | 'running' | 'attention' | 'error' | 'success';

export interface StatusDotProps {
    tone: StatusTone;
    /** The accessible name; shown beside the dot with `showLabel`. */
    label: string;
    showLabel?: boolean;
    /** Draw `success` as a plain green dot instead of a check, where a check already means something else. */
    dot?: boolean;
}

const BOX = 16;

// Each tone has its own shape, so none of them depends on color.
export function StatusDot({ tone, label, showLabel, dot }: StatusDotProps) {
    const { colors } = useTheme();
    let mark;
    if (tone === 'idle') {
        mark = <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.textMuted }} />;
    } else if (tone === 'running') {
        mark = (
            <Pulse>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentBlue }} />
            </Pulse>
        );
    } else if (tone === 'success' && dot) {
        mark = <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentGreen }} />;
    } else if (tone === 'success') {
        mark = <Icon icon={Check} size="sm" tone="success" />;
    } else if (tone === 'attention') {
        mark = <Icon icon={TriangleAlert} size="sm" tone="warning" />;
    } else {
        mark = <Icon icon={CircleAlert} size="sm" tone="danger" />;
    }
    return (
        <Row gap="xs">
            <View accessible accessibilityLabel={label} style={{ width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' }}>
                {mark}
            </View>
            {showLabel ? (
                <Text role="caption" tone="secondary" numberOfLines={1}>
                    {label}
                </Text>
            ) : null}
        </Row>
    );
}
