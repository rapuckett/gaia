import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { colors, palettes, radius, shadows, motion, faces, type PaletteId } from '../tokens/generated';
import { space } from '../tokens/space';
import { typeScale } from '../tokens/type';

export type Scheme = 'light' | 'dark';

export interface Theme {
  scheme: Scheme;
  colors: (typeof colors)['light'];
  radius: typeof radius;
  space: typeof space;
  type: typeof typeScale;
  faces: typeof faces;
  shadows: (typeof shadows)['light'];
  motion: typeof motion;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children, palette = 'default' }: { children: ReactNode; palette?: 'default' | PaletteId }) {
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo<Theme>(
    () => ({
      scheme,
      colors: palette === 'default' ? colors[scheme] : palettes[palette][scheme],
      radius,
      space,
      type: typeScale,
      faces,
      shadows: shadows[scheme],
      motion,
    }),
    [scheme, palette],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme() needs a <UIProvider> above it. Mount UIProvider once in src/app/_layout.tsx.');
  return theme;
}
