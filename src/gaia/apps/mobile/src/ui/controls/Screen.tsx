import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDirection } from '@/i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

export type ScreenEdge = 'top' | 'bottom' | 'start' | 'end';

export interface ScreenProps {
  children?: ReactNode;
  edges?: ScreenEdge[];
  keyboard?: 'avoid' | 'none';
  scroll?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  background?: 'primary' | 'secondary' | 'recessed';
  testID?: string;
}

const ALL: ScreenEdge[] = ['top', 'bottom', 'start', 'end'];

export function Screen({ children, edges = ALL, keyboard = 'none', scroll, header, footer, background = 'primary', testID }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const rtl = useDirection() === 'rtl';
  const keyboardUp = useKeyboardState((s) => s.isVisible);
  const avoid = keyboard === 'avoid';

  const has = (e: ScreenEdge) => edges.includes(e);
  const startInset = rtl ? insets.right : insets.left;
  const endInset = rtl ? insets.left : insets.right;
  const bg = { primary: colors.bgPrimary, secondary: colors.bgSecondary, recessed: colors.bgRecessed }[background];
  // The keyboard covers the bottom inset, so it applies only while the keyboard is down.
  const bottom = has('bottom') && !(avoid && keyboardUp) ? insets.bottom : 0;

  const body = scroll ? (
    avoid ? (
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={16}
      >
        {children}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    )
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );

  const content = (
    <>
      {header}
      {body}
      {footer ? <View>{footer}</View> : null}
    </>
  );

  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: bg,
        paddingTop: has('top') ? insets.top : 0,
        paddingBottom: bottom,
        paddingStart: has('start') ? startInset : 0,
        paddingEnd: has('end') ? endInset : 0,
      }}
    >
      {avoid ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </View>
  );
}
