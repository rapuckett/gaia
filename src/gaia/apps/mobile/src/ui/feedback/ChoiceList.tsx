// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { Check } from '../icons';
import { Row } from '../layout/layout';
import { FirstLine } from '../text/FirstLine';
import { useLargeText } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';

export interface ChoiceOption {
    value: string;
    label: string;
    description?: string;
    /** Shown but not choosable: muted, announced as disabled, and a tap does nothing. */
    disabled?: boolean;
    /** Why it is disabled; takes the place of `description` as the muted second line. */
    reason?: string;
}

type Single = { multiple?: false; value?: string; onChange: (value: string) => void };
type Multiple = { multiple: true; value: string[]; onChange: (value: string[]) => void };
export type ChoiceListProps = { options: ChoiceOption[]; accessibilityLabel?: string; testID?: string } & (Single | Multiple);

// Radio rows pick one; checkbox rows pick several. The mark's shape differs, not just its color.
export function ChoiceList(props: ChoiceListProps) {
    const { colors, radius, space } = useTheme();
    const largeText = useLargeText();
    const { options, multiple } = props;
    const picked = (v: string) => (props.multiple ? props.value.includes(v) : props.value === v);
    const toggle = (v: string) => {
        if (options.find((o) => o.value === v)?.disabled) return;
        if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
        else props.onChange(v);
    };
    return (
        <View testID={props.testID} accessibilityLabel={props.accessibilityLabel} accessibilityRole={multiple ? undefined : 'radiogroup'} style={{ gap: space.xs }}>
            {options.map((o) => {
                const on = picked(o.value);
                const off = !!o.disabled;
                const second = off && o.reason ? o.reason : o.description;
                return (
                    <Pressable
                        key={o.value}
                        testID={props.testID ? `${props.testID}-option-${o.value}` : undefined}
                        onPress={() => toggle(o.value)}
                        accessibilityRole={multiple ? 'checkbox' : 'radio'}
                        accessibilityLabel={second ? `${o.label}. ${second}` : o.label}
                        disabled={off}
                        dimmed={false}
                        aria-checked={on}
                    >
                        <Row gap="md" align="start">
                            <FirstLine role="ui" inset={space.sm}>
                                <View
                                    style={{
                                        width: 22,
                                        height: 22,
                                        marginTop: largeText ? 0 : 2,
                                        borderWidth: 2,
                                        borderRadius: multiple ? radius.sm : radius.full,
                                        borderColor: on ? colors.accentSolid : colors.border,
                                        opacity: off ? 0.4 : 1,
                                        backgroundColor: on && multiple ? colors.accentSolid : 'transparent',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {on && multiple ? <Icon icon={Check} size="sm" tone="inverse" /> : null}
                                    {on && !multiple ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentSolid }} /> : null}
                                </View>
                            </FirstLine>
                            <View style={{ flex: 1, minWidth: 0, paddingVertical: space.sm }}>
                                <Text role="ui" tone={off ? 'muted' : undefined} weight={on ? 'semibold' : 'regular'}>
                                    {o.label}
                                </Text>
                                {second ? (
                                    <Text role="caption" tone="muted">
                                        {second}
                                    </Text>
                                ) : null}
                            </View>
                        </Row>
                    </Pressable>
                );
            })}
        </View>
    );
}
