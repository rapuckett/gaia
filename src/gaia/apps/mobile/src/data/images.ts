// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ImageSettings, ImageSettingsUpdate } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { requireClient } from './queries';

export const imageKeys = {
    settings: ['images', 'settings'] as const,
};

/** The image model, size and steps; the terminal app shares them, so each screen re-reads them on mount. */
export function useImageSettings() {
    const client = useGaiaClient();
    return useQuery<ImageSettings>({
        queryKey: imageKeys.settings,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).getImageSettings({ signal }),
    });
}

export function useUpdateImageSettings() {
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    return useMutation<ImageSettings, Error, ImageSettingsUpdate>({
        mutationFn: (change) => requireClient(client).updateImageSettings(change),
        onSuccess: (saved) => queryClient.setQueryData(imageKeys.settings, saved),
    });
}
