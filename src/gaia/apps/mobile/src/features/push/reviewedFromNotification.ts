// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Approvals whose card the person reached through a notification's Review while the app runs, by chat and approval.
const reviewed = new Set<string>();

export function markReviewedFromNotification(sessionId: string, approvalId: string): void {
    reviewed.add(`${sessionId}\n${approvalId}`);
}

/** Whether the card's answer to this approval comes from a notification, for confirm-tool's `source`. */
export function reviewedFromNotification(sessionId: string, approvalId: string | undefined): boolean {
    return approvalId !== undefined && reviewed.has(`${sessionId}\n${approvalId}`);
}

export function forgetReviewedForTests(): void {
    reviewed.clear();
}
