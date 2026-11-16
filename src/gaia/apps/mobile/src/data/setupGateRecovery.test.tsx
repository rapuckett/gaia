// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { GaiaNetworkError } from "@/api/errors";
import type { GaiaClient, SetupCheck, SystemStatus } from "@/api/client.types";

import { GaiaClientProvider } from "./GaiaClientProvider";
import { shouldRetryQuery } from "./queryRetry";
import { BACKEND_START_WAIT_MS, useSetupGate } from "./setup";
import { useSystemStatus } from "./queries";

async function advance(ms: number) {
  for (let spent = 0; spent < ms; spent += 1_000)
    await act(async () => void (await jest.advanceTimersByTimeAsync(1_000)));
}

describe("the setup gate after the PC comes back", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("re-checks by itself once the PC answers again, as the desktop does on a status answer after an outage", async () => {
    let up = false;
    const down = () =>
      Promise.reject(new GaiaNetworkError("http://pc", new Error("refused")));
    const client = {
      checkSetup: () =>
        up ? Promise.resolve({ ready: true } as SetupCheck) : down(),
      getSystemStatus: () =>
        up
          ? Promise.resolve({ init_state: "ready" } as unknown as SystemStatus)
          : down(),
    } as unknown as GaiaClient;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetryQuery } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
      </QueryClientProvider>
    );
    const { result } = await renderHook(
      () => {
        useSystemStatus();
        return useSetupGate().gate;
      },
      { wrapper },
    );
    await advance(BACKEND_START_WAIT_MS + 5_000);
    expect(result.current.state).toBe("unknown");
    up = true;
    await advance(10_000);
    expect(result.current.state).toBe("ready");
  });
});
