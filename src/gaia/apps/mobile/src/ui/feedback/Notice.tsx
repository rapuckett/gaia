// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import { useT } from '@/i18n/useT';
import { Button } from '../controls/Button';
import { Icon } from '../controls/Icon';
import { IconButton } from '../controls/IconButton';
import { Check, CircleAlert, Info, TriangleAlert, X } from '../icons';
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
    /** Shows a close button at the end. */
    onDismiss?: () => void;
    /** `note` marks a side remark that isn't an alert, e.g. a library notice. */
    role?: 'note';
    /** `card` is the desktop's `.model-warning`: a tinted box with a 25% border in the tone's color, no start bar, and a toned title. */
    variant?: 'tint' | 'card';
    testID?: string;
}

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: Check } as const;
const ICON_TONE: Record<NoticeTone, Tone> = { info: 'accent', warning: 'warning', danger: 'danger', success: 'success' };

function withAlpha(hex: string, alpha: number): string {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) throw new Error(`Notice: expected a #rrggbb color, got ${hex}`);
    return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

// The icon carries the tone with the color, so it never rests on color alone.
export function Notice({ tone, title, message, action, onDismiss, role, variant = 'tint', testID }: NoticeProps) {
    const t = useT();
    const { colors, radius, space } = useTheme();
    const bar = { info: colors.accentSolid, warning: colors.accentYellow, danger: colors.danger, success: colors.accentGreen }[tone];
    const bg = { info: colors.accentDim2, warning: colors.accentYellowDim, danger: colors.dangerDim, success: colors.accentGreenDim }[tone];
    const card = variant === 'card';
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
                ...(card
                    ? { borderWidth: 1, borderColor: withAlpha(bar, 0.25), paddingHorizontal: 14, paddingVertical: space.md }
                    : { borderStartWidth: 3, borderStartColor: bar, padding: space.md }),
            }}
        >
            <Row gap="md" align="start">
                <Icon icon={ICONS[tone]} size="md" tone={ICON_TONE[tone]} />
                <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                    {title ? (
                        <Text role="ui" weight="semibold" tone={card ? ICON_TONE[tone] : undefined}>
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
                {onDismiss ? <IconButton icon={X} size="sm" label={t('banner.dismiss')} onPress={onDismiss} /> : null}
            </Row>
        </View>
    );
}
