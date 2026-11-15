// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect } from 'expo-router';
import { UIProvider } from '@/ui';
import { FormsGallery } from '@/ui/gallery/FormsGallery';

export default function FormsGalleryRoute() {
    if (!__DEV__) return <Redirect href="/" />;
    return (
        <UIProvider>
            <FormsGallery />
        </UIProvider>
    );
}
