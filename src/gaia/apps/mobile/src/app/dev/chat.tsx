// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { CHAT_STATES, ChatGallery, type ChatGalleryState } from '@/features/chat/ChatGallery';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';

/** The chat screen with a turn running; `?state=running-empty|running-status`. */
export default function ChatGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const picked = CHAT_STATES.find((s) => s === state) ?? 'running-empty';
    return <KeyedScene sceneKey={picked} scene={ChatGallery} props={{ state: picked as ChatGalleryState }} />;
}
