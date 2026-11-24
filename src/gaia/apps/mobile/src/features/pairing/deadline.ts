// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** A job that got no answer in time; its request was canceled. */
export class DeadlineError extends Error {
    constructor(what: string, ms: number) {
        super(`${what} got no answer in ${ms / 1000} s.`);
        this.name = 'DeadlineError';
    }
}

/** Runs `job` with a signal that aborts after `ms`, and stops waiting then even if the job doesn't. */
export async function withDeadline<T>(ms: number, what: string, job: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const running = job(controller.signal);
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            // The job's own rejection now is the cancellation just asked for; the deadline is the error reported.
            running.catch(() => undefined);
            reject(new DeadlineError(what, ms));
        }, ms);
    });
    try {
        return await Promise.race([running, deadline]);
    } finally {
        clearTimeout(timer);
    }
}
