// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Runs `check` every `intervalMs`, the next only once the last has settled, so a check that outlasts the
 * interval never runs beside another. `answered` and `failed` say whether to check again. The returned
 * function stops it.
 */
export function pollSettled<T>(
    check: () => Promise<T>,
    intervalMs: number,
    answered: (result: T) => boolean,
    failed: (error: unknown) => boolean,
): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
        timer = setTimeout(() => {
            check()
                .then(answered, failed)
                .then((again) => {
                    if (again && !stopped) next();
                });
        }, intervalMs);
    };
    next();
    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}
