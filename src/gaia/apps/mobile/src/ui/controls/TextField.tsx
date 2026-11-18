// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, useWindowDimensions, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useDirection, useT } from '@/i18n/useT';
import { Eye, EyeOff } from '../icons';
import { IconButton } from './IconButton';
import { LARGE_TEXT_SCALE } from '../theme/a11y';
import { fontFamily } from '../theme/fonts';
import { useTheme } from '../theme/ThemeProvider';
import { contentDir, inputAlign } from '../text/direction';
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
    /** `number-pad` for whole numbers. */
    keyboardType?: KeyboardTypeOptions;
    onSubmitEditing?: () => void;
    secureTextEntry?: boolean;
    /** With `secureTextEntry`: an eye button that shows the text. */
    revealable?: boolean;
    /** A key or password: masked, with no reveal, never suggested, corrected, autofilled or offered to a password manager. */
    secret?: boolean;
    /** Decoration inside the field's start edge (a search icon). */
    leading?: ReactNode;
    /** Content inside the field's end edge (a clear button). */
    trailing?: ReactNode;
    /** No border, fill or focus ring, for a field inside a card that draws its own (the message box). */
    bare?: boolean;
    autoFocus?: boolean;
    /** A web address: the URL keyboard, no autocapitalize or autocorrect. */
    url?: boolean;
    disabled?: boolean;
    inputRef?: Ref<ComponentRef<typeof TextInput>>;
    accessibilityLabel?: string;
    /** What a screen reader adds after the label; a placeholder that shows only one language puts the full text here. */
    accessibilityHint?: string;
    onFocus?: () => void;
    onBlur?: () => void;
    /** Where the typed text and placeholder stop growing with the person's text size. */
    maxFontSizeMultiplier?: number;
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
    keyboardType,
    onSubmitEditing,
    secureTextEntry,
    revealable,
    secret,
    leading,
    trailing,
    bare,
    autoFocus,
    url,
    disabled,
    inputRef,
    accessibilityLabel,
    accessibilityHint,
    onFocus,
    onBlur,
    maxFontSizeMultiplier,
    testID,
}: TextFieldProps) {
    const { colors, radius, type } = useTheme();
    const t = useT();
    const uiRtl = useDirection() === 'rtl';
    // Typed text sets its own side, like a bubble; secrets and empty fields follow the UI.
    const rtl = secureTextEntry || secret ? uiRtl : contentDir(value, uiRtl ? 'rtl' : 'ltr') === 'rtl';
    const valueRtl = url && !value ? uiRtl : false;
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
    const lineHeight = Math.round(size * (rtl ? metrics.lineHeightAr : 1.4));
    const { fontScale, height: windowHeight } = useWindowDimensions();
    const largeText = fontScale >= LARGE_TEXT_SCALE;
    const grownHeight = lineHeight * maxLines * Math.min(fontScale, maxFontSizeMultiplier ?? fontScale) + 24;
    // At large sizes a tall field would push everything else off screen, so it scrolls sooner.
    const maxHeight = largeText ? Math.min(grownHeight, windowHeight * 0.25) : grownHeight;
    // A programmatic value (a restored or prefilled draft) fires no change event, so the box is sized from its own line breaks and, where the platform reports it, the measured text.
    const paddingV = bare ? 8 : 12;
    const [contentHeight, setContentHeight] = useState(0);
    const typedLines = multiline ? Math.min(maxLines, (value ?? '').split('\n').length) : 1;
    const wantHeight = multiline ? Math.min(maxHeight, Math.max(lineHeight * typedLines, contentHeight) + paddingV * 2) : 0;
    const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;
    return (
        <View style={{ gap: 6 }}>
            {label ? (
                <View style={{ opacity: disabled ? 0.45 : 1 }}>
                    <Text role="label" weight="medium" tone="secondary">
                        {label}
                    </Text>
                </View>
            ) : null}
            <View style={{ opacity: disabled ? 0.45 : 1 }}>
            <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                editable={!disabled}
                multiline={multiline}
                onContentSizeChange={multiline ? (e) => setContentHeight(Math.ceil(e.nativeEvent.contentSize.height)) : undefined}
                returnKeyType={returnKeyType}
                keyboardType={url ? 'url' : keyboardType}
                onSubmitEditing={onSubmitEditing}
                submitBehavior={multiline ? 'newline' : 'blurAndSubmit'}
                secureTextEntry={secret || (secureTextEntry && !revealed)}
                autoFocus={autoFocus}
                autoCapitalize={url || secret ? 'none' : undefined}
                autoCorrect={url || secret ? false : undefined}
                {...(secret ? { textContentType: 'none' as const, autoComplete: 'off' as const, importantForAutofill: 'no' as const, spellCheck: false } : null)}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityHint={accessibilityHint}
                onFocus={() => {
                    setFocused(true);
                    onFocus?.();
                }}
                onBlur={() => {
                    setFocused(false);
                    onBlur?.();
                }}
                selectionColor={colors.accentSolid}
                maxFontSizeMultiplier={maxFontSizeMultiplier}
                testID={testID}
                style={{
                    minHeight: multiline ? Math.max(bare ? 40 : 48, wantHeight) : bare ? 40 : 48,
                    ...(multiline
                        ? { maxHeight, textAlignVertical: 'top' as const }
                        : null),
                    paddingStart: leading ? 40 : bare ? 4 : 12,
                    paddingEnd: end ? 48 : bare ? 4 : 12,
                    paddingVertical: paddingV,
                    borderRadius: radius.md,
                    borderWidth: bare ? 0 : 1,
                    borderColor,
                    backgroundColor: disabled ? colors.bgTertiary : bare ? 'transparent' : colors.bgInput,
                    color: colors.textPrimary,
                    fontFamily: fontFamily({ weight: 'regular', mono: false, display: false }),
                    fontSize: size,
                    lineHeight,
                    // A web address types LTR; its empty placeholder follows the UI.
                    ...(url
                        ? { textAlign: inputAlign(valueRtl), writingDirection: valueRtl ? ('rtl' as const) : ('ltr' as const) }
                        : { textAlign: inputAlign(rtl), writingDirection: rtl ? ('rtl' as const) : ('ltr' as const) }),
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
