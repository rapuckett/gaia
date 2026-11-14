// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect } from 'expo-router';
import { UIProvider } from '@/ui';
import { ListsGallery } from '@/ui/gallery/ListsGallery';

export default function UiListsGalleryRoute() {
    if (!__DEV__) return <Redirect href="/" />;
    return (
        <UIProvider>
            <ListsGallery />
        </UIProvider>
    );
}
