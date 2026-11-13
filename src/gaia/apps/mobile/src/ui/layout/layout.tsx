import { View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { Space } from '../tokens/space';

type Align = 'start' | 'center' | 'end' | 'stretch';
type Justify = 'start' | 'center' | 'end' | 'between';

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

interface BoxProps {
  children?: ReactNode;
  gap?: Space;
  align?: Align;
  justify?: Justify;
  flex?: number;
  testID?: string;
}

export interface StackProps extends BoxProps {
  padding?: Space;
  paddingX?: Space;
  paddingY?: Space;
}

export interface RowProps extends BoxProps {
  wrap?: boolean;
}

function useBox(p: BoxProps): ViewStyle {
  const { space } = useTheme();
  const style: ViewStyle = {};
  if (p.gap) style.gap = space[p.gap];
  if (p.align) style.alignItems = ALIGN[p.align];
  if (p.justify) style.justifyContent = JUSTIFY[p.justify];
  if (p.flex !== undefined) style.flex = p.flex;
  return style;
}

export function Stack({ children, padding, paddingX, paddingY, testID, ...box }: StackProps) {
  const { space } = useTheme();
  const style = useBox(box);
  if (padding) style.padding = space[padding];
  if (paddingX) style.paddingHorizontal = space[paddingX];
  if (paddingY) style.paddingVertical = space[paddingY];
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

export function Row({ children, wrap, align = 'center', testID, ...box }: RowProps) {
  const style = useBox({ ...box, align });
  style.flexDirection = 'row';
  if (wrap) style.flexWrap = 'wrap';
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

export function Spacer() {
  return <View style={{ flex: 1 }} />;
}
