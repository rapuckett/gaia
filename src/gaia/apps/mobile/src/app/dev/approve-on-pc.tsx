// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { APPROVE_STATES, ApproveOnPcGallery } from '@/features/devices/ApproveOnPcGallery';
import type { DevicePromptState } from '@/features/devices/devicePrompts';

/** The "Approve on your PC" notice in a sample card: `?state=idle|waiting|approved|cancelled|denied|timeout&kind=keyStore|admin`. */
export default function ApproveOnPcGalleryRoute() {
    const { state = 'waiting', kind = 'keyStore' } = useLocalSearchParams<{ state?: string; kind?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const known = APPROVE_STATES.includes(state as DevicePromptState) ? (state as DevicePromptState) : 'waiting';
    return <ApproveOnPcGallery key={`${known}-${kind}`} state={known} kind={kind === 'admin' ? 'admin' : 'keyStore'} />;
}
