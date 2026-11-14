// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* global jest */

// Native-only modules that `@/ui` imports and Jest can't load; a test that needs one's behavior mocks it itself.
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-gesture-handler', () => ({
    GestureHandlerRootView: ({ children }) => children,
    GestureDetector: ({ children }) => children,
    usePanGesture: () => ({}),
}));
jest.mock('react-native-reanimated', () => {
    const { View } = require('react-native');
    return {
        __esModule: true,
        default: { View },
        Easing: { bezier: () => undefined, inOut: () => undefined, ease: undefined },
        useAnimatedStyle: () => ({}),
        useReducedMotion: () => true,
        useSharedValue: (value) => ({ value }),
        withRepeat: (value) => value,
        withSequence: (value) => value,
        withTiming: (value) => value,
    };
});
// The package's ESM entry is .mjs, which Babel doesn't transform; icons render as nothing.
jest.mock('lucide-react-native', () => new Proxy({ __esModule: true }, { get: (target, name) => (name in target ? target[name] : () => null) }));
