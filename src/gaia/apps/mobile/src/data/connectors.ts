// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query';

import type { AgentMcpList, ConnectorList } from '@/api/client.types';

import { useGaiaClient } from './GaiaClientProvider';
import { queryKeys, requireClient } from './queries';

/** Every connector this PC knows, including those whose live state GAIA couldn't read. */
export function useConnectors() {
    const client = useGaiaClient();
    return useQuery<ConnectorList>({
        queryKey: queryKeys.connectors,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listConnectors({ signal }),
    });
}

/** MCP servers that custom agents declare themselves (read-only). */
export function useAgentMcps() {
    const client = useGaiaClient();
    return useQuery<AgentMcpList>({
        queryKey: queryKeys.agentMcps,
        enabled: client !== null,
        queryFn: ({ signal }) => requireClient(client).listAgentMcps({ signal }),
    });
}
