// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { CHAT_STATES, ChatGallery, type ChatGalleryState } from '@/features/chat/ChatGallery';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';

/** The chat screen with a turn running; `?state=…`, `?queued=<model id>` (a queued model switch), `?model=none` (no model reported). */
export default function ChatGalleryRoute() {
    const { state, queued, model } = useLocalSearchParams<{ state?: string; queued?: string; model?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const picked = CHAT_STATES.find((s) => s === state) ?? 'running-empty';
    const props = { state: picked as ChatGalleryState, queued: queued || undefined, model: model === 'none' ? ('none' as const) : undefined };
    return <KeyedScene sceneKey={`${picked}|${queued ?? ''}|${model ?? ''}`} scene={ChatGallery} props={props} />;
}
