// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type ReturnKeyTypeOptions } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useT } from '@/i18n/useT';
import { Eye, EyeOff } from '../icons';
import { IconButton } from './IconButton';
import { fontFamily } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';
import { Icon } from './Icon';
import { Row } from '../layout/layout';
import { metrics } from '../tokens/generated';

export interface TextFieldProps {
    value: string;
    onChangeText: (text: string) => void;
    label?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    multiline?: boolean;
    maxLines?: number;
    returnKeyType?: ReturnKeyTypeOptions;
    onSubmitEditing?: () => void;
    secureTextEntry?: boolean;
    /** With `secureTextEntry`: an eye button that shows the text. */
    revealable?: boolean;
    /** Decoration inside the field's start edge (a search icon). */
    leading?: ReactNode;
    /** Content inside the field's end edge (a clear button). */
    trailing?: ReactNode;
    /** No border, fill or focus ring, for a field inside a card that draws its own (the message box). */
    bare?: boolean;
    autoFocus?: boolean;
    /** A link or id: the URL keyboard, no capital letter or autocorrect. */
    url?: boolean;
    disabled?: boolean;
    inputRef?: Ref<ComponentRef<typeof TextInput>>;
    accessibilityLabel?: string;
    testID?: string;
}

export function TextField({
    value,
    onChangeText,
    label,
    placeholder,
    hint,
    error,
    multiline,
    maxLines = 6,
    returnKeyType,
    onSubmitEditing,
    secureTextEntry,
    revealable,
    leading,
    trailing,
    bare,
    autoFocus,
    url,
    disabled,
    inputRef,
    accessibilityLabel,
    testID,
}: TextFieldProps) {
    const { colors, radius, type } = useTheme();
    const t = useT();
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const canReveal = !!secureTextEntry && !!revealable;
    const end = canReveal ? (
        <IconButton
            icon={revealed ? EyeOff : Eye}
            label={t(revealed ? 'setup.key.hide' : 'setup.key.show')}
            size="sm"
            onPress={() => setRevealed((r) => !r)}
            disabled={disabled}
        />
    ) : (
        trailing
    );
    const size = Math.max(type.body, metrics.inputFontSize);
    const lineHeight = Math.round(size * 1.4);
    const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;
    return (
        <View style={{ gap: 6, opacity: disabled ? 0.45 : 1 }}>
            {label ? (
                <Text role="label" weight="medium" tone="secondary">
                    {label}
                </Text>
            ) : null}
            <View>
            <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                editable={!disabled}
                multiline={multiline}
                returnKeyType={returnKeyType}
                onSubmitEditing={onSubmitEditing}
                submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
                secureTextEntry={secureTextEntry && !revealed}
                autoFocus={autoFocus}
                keyboardType={url ? 'url' : undefined}
                autoCapitalize={url ? 'none' : undefined}
                autoCorrect={url ? false : undefined}
                accessibilityLabel={accessibilityLabel ?? label}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                selectionColor={colors.accentSolid}
                testID={testID}
                style={{
                    minHeight: bare ? 40 : 48,
                    ...(multiline
                        ? { maxHeight: lineHeight * maxLines + 24, textAlignVertical: 'top' as const }
                        : null),
                    paddingStart: leading ? 40 : bare ? 4 : 12,
                    paddingEnd: end ? 48 : bare ? 4 : 12,
                    paddingVertical: bare ? 8 : 12,
                    borderRadius: radius.md,
                    borderWidth: bare ? 0 : 1,
                    borderColor,
                    backgroundColor: bare ? 'transparent' : colors.bgInput,
                    color: colors.textPrimary,
                    fontFamily: fontFamily({ weight: 'regular', mono: false, display: false }),
                    fontSize: size,
                    lineHeight,
                    textAlign: 'auto',
                    ...(focused && !error && !bare ? { boxShadow: `0 0 0 3px ${colors.accentRing}` } : null),
                }}
            />
            {leading ? (
                <View pointerEvents="none" style={{ position: 'absolute', start: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
                    {leading}
                </View>
            ) : null}
            {end ? <View style={{ position: 'absolute', end: 0, top: 0, bottom: 0, justifyContent: 'center' }}>{end}</View> : null}
            </View>
            {error ? (
                <Row gap="xs" align="start">
                    <Icon icon={CircleAlert} size="sm" tone="danger" />
                    <View style={{ flex: 1 }}>
                        <Text role="label" tone="danger">
                            {error}
                        </Text>
                    </View>
                </Row>
            ) : hint ? (
                <Text role="label" tone="muted">
                    {hint}
                </Text>
            ) : null}
        </View>
    );
}
