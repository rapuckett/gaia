// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '@webui/i18n/registry';

export interface SectionProps {
    sessionId: string;
    /** A reply is running or waiting on a prompt: sections re-read what the agent reports. */
    live: boolean;
    /** A tool approval is waiting on this chat (what the composer's permission chip gets). */
    promptWaiting?: boolean;
    /** Closes the panel, so what a section jumps to is in view. */
    close?: () => void;
}

export const DETAILS_HEADING: MessageKey = 'sp.details';
