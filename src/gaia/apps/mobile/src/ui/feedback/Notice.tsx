// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import { Button } from '../controls/Button';
import { Icon } from '../controls/Icon';
import { Check, CircleAlert, Info, TriangleAlert } from '../icons';
import { Row } from '../layout/layout';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';
import type { Tone } from '../theme/tone';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface NoticeProps {
    tone: NoticeTone;
    title?: string;
    message?: string;
    action?: { label: string; onPress: () => void };
    /** `note` marks a side remark that isn't an alert, e.g. a library notice. */
    role?: 'note';
    testID?: string;
}

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: Check } as const;
const ICON_TONE: Record<NoticeTone, Tone> = { info: 'accent', warning: 'warning', danger: 'danger', success: 'success' };

// The icon carries the tone with the color, so it never rests on color alone.
export function Notice({ tone, title, message, action, role, testID }: NoticeProps) {
    const { colors, radius, space } = useTheme();
    const bar = { info: colors.accentSolid, warning: colors.accentYellow, danger: colors.danger, success: colors.accentGreen }[tone];
    const bg = { info: colors.accentDim2, warning: colors.accentYellowDim, danger: colors.dangerDim, success: colors.accentGreenDim }[tone];
    return (
        <View
            testID={testID}
            accessible
            role={role}
            accessibilityRole={role ? undefined : tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
            accessibilityLiveRegion={tone === 'danger' || tone === 'warning' ? 'assertive' : 'polite'}
            style={{
                backgroundColor: bg,
                borderRadius: radius.md,
                borderStartWidth: 3,
                borderStartColor: bar,
                padding: space.md,
            }}
        >
            <Row gap="md" align="start">
                <Icon icon={ICONS[tone]} size="md" tone={ICON_TONE[tone]} />
                <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                    {title ? (
                        <Text role="ui" weight="semibold">
                            {title}
                        </Text>
                    ) : null}
                    {message ? (
                        <Text role="label" tone="secondary">
                            {message}
                        </Text>
                    ) : null}
                    {action ? <Button variant="ghost" size="sm" label={action.label} onPress={action.onPress} /> : null}
                </View>
            </Row>
        </View>
    );
}
