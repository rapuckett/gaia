// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

/** The screens the plan step leads to; each is another task's work, which provides the handler. */
export interface PlanOpeners {
    /** Customize: the models screen. */
    openModels?: () => void;
    /** Cloud, Continue: the provider and key screen. */
    openKey?: () => void;
    /** Low space, Continue: asks to go on anyway, then calls `proceed(true)`. */
    confirmLowDisk?: (proceed: (acknowledgeLowDisk: boolean) => void) => void;
}

export const PlanOpenersContext = createContext<PlanOpeners>({});

export function usePlanOpeners(): PlanOpeners {
    return useContext(PlanOpenersContext);
}
