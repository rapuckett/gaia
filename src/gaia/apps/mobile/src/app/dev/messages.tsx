// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { MessagesGallery } from '@/features/chat/messages/MessagesGallery';
import { FIXTURES, type MessagesFixture } from '@/features/chat/messages/__fixtures__/messages';
import { UIProvider } from '@/ui';

export default function MessagesGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    if (!__DEV__) return <Redirect href="/" />;
    const fixture = state && state in FIXTURES ? (state as MessagesFixture) : 'long';
    return (
        <UIProvider>
            <MessagesGallery state={fixture} />
        </UIProvider>
    );
}
