import { View } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme, type Theme } from '../theme/ThemeProvider';
import type { Space } from '../tokens/space';
import { Pressable } from '../controls/Pressable';

export type SurfaceTone = 'primary' | 'secondary' | 'card' | 'recessed' | 'userMsg';
export type Elevation = 'none' | 'sm' | 'md' | 'lg';

export interface SurfaceProps {
  children?: ReactNode;
  tone?: SurfaceTone;
  radius?: keyof Theme['radius'] | 'none';
  padding?: Space;
  border?: boolean;
  elevation?: Elevation;
  testID?: string;
}

export function useSurfaceStyle({ tone = 'primary', radius, padding, border, elevation = 'none' }: SurfaceProps) {
  const { colors, radius: radii, space, shadows } = useTheme();
  const bg = {
    primary: colors.bgPrimary,
    secondary: colors.bgSecondary,
    card: colors.bgCard,
    recessed: colors.bgRecessed,
    userMsg: colors.bgUserMsg,
  }[tone];
  return {
    backgroundColor: bg,
    borderRadius: radius === undefined || radius === 'none' ? 0 : radii[radius],
    ...(padding ? { padding: space[padding] } : null),
    ...(border ? { borderWidth: 1, borderColor: tone === 'recessed' ? colors.borderRecessed : colors.borderLight } : null),
    ...(elevation !== 'none' ? { boxShadow: shadows[elevation] } : null),
  } as const;
}

export function Surface(props: SurfaceProps) {
  const style = useSurfaceStyle(props);
  return (
    <View style={style} testID={props.testID}>
      {props.children}
    </View>
  );
}

export interface CardProps {
  children?: ReactNode;
  padding?: Space;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({ children, padding = 'lg', onPress, accessibilityLabel, testID }: CardProps) {
  const style = useSurfaceStyle({ tone: 'card', radius: 'lg', padding, elevation: 'sm' });
  if (!onPress) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityLabel={accessibilityLabel} testID={testID} minSize={0}>
      <View style={style}>{children}</View>
    </Pressable>
  );
}

export function Divider({ inset = false }: { inset?: boolean }) {
  const { colors, space } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.borderLight, marginStart: inset ? space.lg : 0 }} />;
}
