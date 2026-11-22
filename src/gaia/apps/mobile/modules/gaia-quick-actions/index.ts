// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { Platform } from 'react-native';

/** One action on the app icon: a long-press on iOS, an app shortcut on Android. Each shows the system compose glyph. */
export interface QuickActionItem {
    id: string;
    title: string;
}

export interface QuickActionsNative {
    /** Replaces every action on the icon. */
    setItems(items: QuickActionItem[]): Promise<void>;
    /** The action that opened or resumed the app before anything listened, once; null after that. */
    takePending(): string | null;
    /** An action chosen while something listens. */
    addListener(event: 'onAction', listener: (event: { id: string }) => void): EventSubscription;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<QuickActionsNative>('GaiaQuickActions') : null;

/** The app icon's actions; null on the web and in builds made before the module. */
export function quickActions(): QuickActionsNative | null {
    return native;
}
