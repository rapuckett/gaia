// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

type Recheck = () => Promise<void> | void;

const GateRecheckContext = createContext<Recheck | null>(null);

/** Provided by the setup gate while its model-server-down state is up, so the one server card can clear the gate too. */
export const GateRecheckProvider = GateRecheckContext.Provider;

export function useGateRecheck(): Recheck | null {
    return useContext(GateRecheckContext);
}
