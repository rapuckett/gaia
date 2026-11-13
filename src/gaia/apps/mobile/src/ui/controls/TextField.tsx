import { useState, type Ref } from 'react';
import { TextInput, View, type ReturnKeyTypeOptions } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
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
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: Ref<TextInput>;
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
  autoFocus,
  disabled,
  inputRef,
  accessibilityLabel,
  testID,
}: TextFieldProps) {
  const { colors, radius, type } = useTheme();
  const [focused, setFocused] = useState(false);
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
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel ?? label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={colors.accentSolid}
        testID={testID}
        style={{
          minHeight: 48,
          ...(multiline ? { maxHeight: lineHeight * maxLines + 24, textAlignVertical: 'top' as const } : null),
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor,
          backgroundColor: colors.bgInput,
          color: colors.textPrimary,
          fontFamily: fontFamily({ weight: 'regular', mono: false, display: false }),
          fontSize: size,
          lineHeight,
          textAlign: 'auto',
          ...(focused && !error ? { boxShadow: `0 0 0 3px ${colors.accentRing}` } : null),
        }}
      />
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
