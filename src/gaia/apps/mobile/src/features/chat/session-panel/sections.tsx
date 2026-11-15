// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import type { MessageKey } from '@webui/i18n/registry';

import { AgentInfoSection } from './AgentInfoSection';
import type { PanelSectionId } from './panelStore';
import { SkillsSection } from './SkillsSection';

export interface SectionProps {
    sessionId: string;
    /** A reply is running or waiting on a prompt: sections re-read what the agent reports. */
    live: boolean;
}

export interface SectionEntry {
    id: PanelSectionId;
    /** 'details' sections sit under the "Details" heading, shown above the first one. */
    group?: 'details';
    render(props: SectionProps): ReactNode;
}

export const DETAILS_HEADING: MessageKey = 'sp.details';

/**
 * The panel's sections in the web's order: This answer, Outputs, Changes, Folders and access,
 * Skills, then the Details group (Context & performance, Agent info). A later task adds
 * its entry at its place in this list; an unbuilt section has no entry, so it shows nothing.
 */
export const SECTIONS: readonly SectionEntry[] = [
    { id: 'skills', render: (p) => <SkillsSection {...p} /> },
    { id: 'tools', group: 'details', render: (p) => <AgentInfoSection {...p} /> },
];
