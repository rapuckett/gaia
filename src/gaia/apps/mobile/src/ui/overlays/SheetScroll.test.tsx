// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, useEffect, type ReactElement } from 'react';
import { ScrollView, View } from 'react-native';
import { createRoot } from 'test-renderer';
import { Sheet } from './Sheet';
import { SheetHost, useSheetScroll, type SheetScrollHandle } from './SheetHost';
import { sheetStore } from './sheetStore';

let mockReduced = false;
jest.mock('react-native-reanimated', () => {
    const { View: V } = jest.requireActual('react-native');
    return {
        __esModule: true,
        default: { View: V },
        Easing: { bezier: () => undefined },
        useAnimatedStyle: () => ({}),
        useReducedMotion: () => mockReduced,
        useSharedValue: (value: number) => ({ value }),
        withTiming: (value: number) => value,
    };
});
jest.mock('react-native-gesture-handler', () => ({
    GestureDetector: ({ children }: { children: ReactElement }) => children,
    usePanGesture: () => ({}),
}));
jest.mock('react-native-keyboard-controller', () => ({
    KeyboardAvoidingView: ({ children }: { children: ReactElement }) => children,
    useKeyboardState: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, start: 0, end: 0 }) }));
jest.mock('@/i18n/useT', () => ({ useT: () => (key: string) => key, useDirection: () => 'ltr' }));
jest.mock('../theme/ThemeProvider', () => {
    const { colors, radius, shadows } = jest.requireActual('../tokens/generated');
    const { space } = jest.requireActual('../tokens/space');
    const theme = { scheme: 'light', colors: colors.light, radius, space, shadows: shadows.light };
    return { useTheme: () => theme };
});
jest.mock('../controls/IconButton', () => ({ IconButton: () => null }));
jest.mock('../icons', () => ({ X: () => null }));
jest.mock('../text/Text', () => ({ Text: ({ children }: { children: unknown }) => children }));

let handle: SheetScrollHandle | null = null;
function Probe() {
    const found = useSheetScroll();
    useEffect(() => {
        handle = found;
    }, [found]);
    return <View />;
}

async function show() {
    const root = createRoot();
    await act(async () => {
        root.render(
            <SheetHost>
                <Sheet open onClose={() => undefined}>
                    <Probe />
                </Sheet>
            </SheetHost>,
        );
    });
    return root;
}

describe('the sheet scroll handle', () => {
    let scrollTo: jest.SpyInstance;
    beforeEach(() => {
        scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(() => undefined);
        handle = null;
    });
    afterEach(() => {
        scrollTo.mockRestore();
        sheetStore.reset();
    });

    it('scrolls the measured target to the top, animated', async () => {
        mockReduced = false;
        const root = await show();
        const target = { measureLayout: (_to: unknown, ok: (x: number, y: number) => void) => ok(0, 420) };
        handle!.scrollTo(target as never);
        expect(scrollTo).toHaveBeenCalledWith({ y: 420, animated: true });
        await act(async () => root.unmount());
    });

    it('jumps without animation when reduced motion is on', async () => {
        mockReduced = true;
        const root = await show();
        handle!.scrollTo({ measureLayout: (_to: unknown, ok: (x: number, y: number) => void) => ok(0, 90) } as never);
        expect(scrollTo).toHaveBeenCalledWith({ y: 90, animated: false });
        await act(async () => root.unmount());
    });
});
