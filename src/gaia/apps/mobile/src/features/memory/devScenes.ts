// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient } from '@/api/fake';
import type { GaiaClient, MemoryStats } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';

export type MemoryScene = 'on' | 'off' | 'loading' | 'failed' | 'actionFails';

export const SAMPLE_MEMORY_STATS: MemoryStats = {
    knowledge: {
        total: 42, total_retrievals: 118, by_category: { fact: 20, preference: 12, note: 10 }, by_context: { global: 42 },
        sensitive_count: 2, entity_count: 7, avg_confidence: 0.82, oldest: '2026-09-01T00:00:00Z', newest: '2026-11-13T00:00:00Z',
    },
    conversations: { total_turns: 310, total_sessions: 24, consolidated_sessions: 20, first_session: '2026-09-01T00:00:00Z', last_session: '2026-11-13T00:00:00Z' },
    tools: { total_calls: 90, unique_tools: 8, overall_success_rate: 0.94, total_errors: 5 },
    temporal: { upcoming_count: 1, overdue_count: 0 },
    db_size_bytes: 1_800_000,
};

/** A fake PC for the dev gallery route, one per state the screen has to show. */
export function memoryScene(scene: MemoryScene): GaiaClient {
    const client = createFakeClient({
        memorySettings: { memory_enabled: scene !== 'off', mcp_memory_enabled: false, system_discovery_consent: true },
        memoryStats: scene === 'failed' ? [new GaiaApiError(503, 'The backend is not running')] : [SAMPLE_MEMORY_STATS],
        embeddingCoverage: { total_items: 42, with_embedding: 36, without_embedding: 6, coverage_pct: 85.7 },
        memoryActionResults: {
            consolidate: scene === 'actionFails' ? new GaiaApiError(500, 'Database is locked') : { status: 'ok', consolidated: 3, extracted_items: 12 },
        },
    });
    return scene === 'loading' ? { ...client, getMemoryStats: () => new Promise<never>(() => undefined) } : client;
}
