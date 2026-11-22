// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useActiveModel, useGoalStoreError, useQueryFailure, useStatusHealth, useSystemStatus } from '@/data';
import { useT } from '@/i18n/useT';
import { hasTailnetRoute, useActiveConnection } from '@/features/pairing/routes';
import { usePickLoadStore } from '@/state/pickLoad';
import { sameModelId } from '@webui/utils/modelList.core';

import { pickBanner, type Banner } from './pickBanner';

/** The banner the app would show now, before any dismissal, and the status read behind it. */
export function useBannerPick(): { picked: Banner | null; refetch: () => unknown; status: ReturnType<typeof useSystemStatus> } {
    const t = useT();
    const status = useSystemStatus();
    const { data } = status;
    const held = useQueryFailure(status).error;
    // A PC that answered once keeps its last status in the cache; its latest failure must still show.
    const error = status.error ?? held;
    const { slow, slowPending, lost } = useStatusHealth();
    const connection = useActiveConnection();
    const goalStoreError = useGoalStoreError().data;
    const load = usePickLoadStore((s) => s.pickLoad);
    const activeModel = useActiveModel().data;
    const name = load && sameModelId(activeModel?.model, load.model) ? activeModel?.display_name : null;
    const picked = pickBanner(data, error, t, goalStoreError, { load, name, awayHint: hasTailnetRoute(connection), slow, slowPending, lost });
    return { picked, refetch: status.refetch, status };
}
