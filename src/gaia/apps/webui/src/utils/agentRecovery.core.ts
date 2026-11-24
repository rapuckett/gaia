// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** When a failed chat reply may offer the agent's two fixes. Pure, so the phone app can import it. */

export const FLAGSHIP_FAST = 'gaiacpp';

/** True while the Fast and light agent is the chosen flagship. */
export function isFastAgent(flagship: string | null | undefined): boolean {
    return flagship === FLAGSHIP_FAST;
}

/** The newest failed reply that can be tried again, unless the model server is the cause (it has its own fix). */
export function offersAgentRecovery(msg: { failed?: boolean; failure?: string }, canTryAgain: boolean): boolean {
    return msg.failed === true && msg.failure !== 'model_server_down' && canTryAgain;
}
