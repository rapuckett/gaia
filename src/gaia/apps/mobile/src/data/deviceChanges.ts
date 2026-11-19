// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query';

import type { DeviceChangeList } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

/** The most rows the PC keeps for a device. */
export const DEVICE_CHANGES_KEPT = 200;

/** Changes this phone made on the connected PC, newest first. Reads nothing until `enabled`, so a closed list costs no request. */
export function useDeviceChanges(deviceId: string | undefined, limit: number, enabled: boolean) {
    const client = useGaiaClient();
    return useQuery<DeviceChangeList>({
        queryKey: ['deviceChanges', deviceId, limit],
        enabled: enabled && client !== null && !!deviceId,
        queryFn: ({ signal }) => requireClient(client).listDeviceChanges(deviceId!, limit, { signal }),
        retry: false,
    });
}
