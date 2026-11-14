// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ContextUsage, StreamEvent } from "@/api/client.types";

import { useGaiaClient } from "./GaiaClientProvider";
import { requireClient } from "./queries";

export const contextKeys = {
  usage: (sessionId: string) => ["contextUsage", sessionId] as const,
};

export interface ContextReading {
  usage: ContextUsage | null;
  /** Why there is no reading yet, from the PC. */
  unavailable: string | null;
}

/**
 * How full the chat's context window is: the PC's reading between turns, and the numbers a running
 * turn streams. It is measured again each time a turn ends (`running` goes false).
 */
export function useContextUsage(
  sessionId: string,
  events: readonly StreamEvent[],
  running: boolean,
): ContextReading {
  const client = useGaiaClient();
  const queryClient = useQueryClient();
  const key = contextKeys.usage(sessionId);
  const { data } = useQuery({
    queryKey: key,
    enabled: client !== null,
    queryFn: ({ signal }) =>
      requireClient(client).getContextUsage(sessionId, { signal }),
  });
  useEffect(() => {
    if (!running) void queryClient.invalidateQueries({ queryKey: key });
  }, [running, queryClient, key]);

  let streamed: StreamEvent | undefined;
  if (running)
    for (let i = events.length - 1; i >= 0 && !streamed; i--)
      if (events[i]!.type === "context_usage") streamed = events[i];
  if (streamed)
    return { usage: streamed as unknown as ContextUsage, unavailable: null };
  if (!data) return { usage: null, unavailable: null };
  return data.available
    ? { usage: data, unavailable: null }
    : { usage: null, unavailable: data.reason };
}
