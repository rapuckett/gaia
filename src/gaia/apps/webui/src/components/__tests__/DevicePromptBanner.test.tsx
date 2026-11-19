// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The top banner that says which paired device raised the system prompt now open on the PC. */

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevicePromptBanner } from '../DevicePromptBanner';
import { handleDeviceEvent, useDeviceStore } from '../../stores/deviceStore';

const device = (id: string, name: string) => ({ id, name, platform: 'ios' as const, status: 'allowed' as const, created_at: '2026-11-18T00:00:00Z' });
const prompt = (device_id: string, kind: string, action: string, state: string) => act(() => { handleDeviceEvent({ type: 'device_prompt', device_id, kind, action, state } as never); });

beforeEach(() => useDeviceStore.setState({ devices: [device('d1', 'Rich iPhone'), device('d2', 'Kitchen iPad')], prompts: [] }));

describe('DevicePromptBanner', () => {
    it('names the device while its prompt waits, and clears when the prompt ends', () => {
        render(<DevicePromptBanner />);
        prompt('d1', 'admin', 'gpuMemoryApply', 'waiting');
        expect(screen.getByRole('status')).toHaveTextContent(/Rich iPhone.*administrator permission to give the GPU more memory/);
        prompt('d1', 'admin', 'gpuMemoryApply', 'denied');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows one banner per device, newest on top, and an action it has no label for reads without one', () => {
        render(<DevicePromptBanner />);
        prompt('d1', 'key_store', 'providerKeyStore', 'waiting');
        prompt('d2', 'admin', 'somethingNew', 'waiting');
        const banners = screen.getAllByTestId('device-prompt-banner');
        expect(banners).toHaveLength(2);
        expect(banners[0]).toHaveTextContent('Kitchen iPad asked for administrator permission. Approve');
        expect(banners[1]).toHaveTextContent('asked to unlock the key store');
        prompt('d1', 'key_store', 'providerKeyStore', 'timeout');
        expect(screen.getAllByTestId('device-prompt-banner')).toHaveLength(1);
    });
});
