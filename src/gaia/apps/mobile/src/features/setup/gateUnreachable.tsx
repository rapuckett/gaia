// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

const GateUnreachableContext = createContext(false);

/** Provided by the setup gate while its "Can't reach your PC" notice is up. */
export const GateUnreachableProvider = GateUnreachableContext.Provider;

export function useGateUnreachable(): boolean {
    return useContext(GateUnreachableContext);
}
