// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { useT } from '@/i18n/useT';
import { Screen } from '@/ui';

// Seam for the new-chat screen: replace the body, keep the route.
export default function NewChatRoute() {
    const t = useT();
    return <Screen header={<ScreenHeader title={t('sidebar.newChat')} />} />;
}
