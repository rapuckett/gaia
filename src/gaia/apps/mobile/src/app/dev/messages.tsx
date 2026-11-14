// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { MessagesGallery, type MessagesGalleryState } from '@/features/chat/messages/MessagesGallery';
import { FIXTURES } from '@/features/chat/messages/__fixtures__/messages';
import { UIProvider } from '@/ui';

const OPEN_STATES = ['actions', 'delete', 'edit'];

function isState(state?: string): state is MessagesGalleryState {
    return !!state && (state in FIXTURES || OPEN_STATES.includes(state));
}

export default function MessagesGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    if (!__DEV__) return <Redirect href="/" />;
    const fixture = isState(state) ? state : 'long';
    return (
        <UIProvider>
            <MessagesGallery state={fixture} />
        </UIProvider>
    );
}
