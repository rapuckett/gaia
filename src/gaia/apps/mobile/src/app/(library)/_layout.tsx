// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Stack, useNavigation, usePathname } from 'expo-router';
import { useEffect } from 'react';

// A preview or the browser cold-linked has the library beneath it.
export const unstable_settings = { anchor: 'documents' };

/** The library is one drawer screen holding a stack, so a preview pops back to where it opened. */
export default function LibraryLayout() {
    const navigation = useNavigation();
    const pathname = usePathname();
    const root = pathname === '/documents';

    // The drawer's edge swipe would take the iOS swipe-back on a pushed screen; leaving resets the stack to Documents.
    useEffect(() => {
        navigation.setOptions({ swipeEnabled: root, popToTopOnBlur: true });
        return () => navigation.setOptions({ swipeEnabled: true, popToTopOnBlur: false });
    }, [navigation, root]);

    return <Stack screenOptions={{ headerShown: false }} />;
}
