// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Whether picking *model* must first show its provider's privacy notice: a step from a local model
 * to a cloud one. `consentedModel` is the model whose notice the user accepted ("Use {model}").
 * An active model not read yet counts as local, so nothing goes to the cloud unasked.
 */
export function needsCloudConsent(
    provider: { remote: boolean },
    active: { remote: boolean } | null | undefined,
    model: string,
    consentedModel: string | null | undefined,
): boolean {
    return provider.remote && !active?.remote && consentedModel !== model;
}
