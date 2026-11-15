// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ComponentType } from 'react';

import type { LucideIcon } from '@/ui/icons';
import { Bell, Brain, Clock, Cpu, Info, ListChecks, Lock, MessageSquare, Plug, ShieldQuestion, SlidersHorizontal, Sparkles, Volume2, Wrench } from '@/ui/icons';

import Placeholder from './panes/Placeholder';

/** The web's settings sections, in its nav order; `voice` is "Read aloud". */
export type SectionId =
    | 'general'
    | 'setup'
    | 'model'
    | 'permissions'
    | 'skills'
    | 'connectors'
    | 'messaging'
    | 'automations'
    | 'memory'
    | 'notifications'
    | 'voice'
    | 'privacy'
    | 'advanced'
    | 'about';

export interface SettingsSectionEntry {
    titleKey: `settings.section.${SectionId}`;
    icon: LucideIcon;
    /** The one place a pane is wired: a set-* task swaps in its pane's import. */
    pane: ComponentType;
}

export const SETTINGS_SECTIONS: Record<SectionId, SettingsSectionEntry> = {
    general: { titleKey: 'settings.section.general', icon: SlidersHorizontal, pane: Placeholder },
    setup: { titleKey: 'settings.section.setup', icon: ListChecks, pane: Placeholder },
    model: { titleKey: 'settings.section.model', icon: Cpu, pane: Placeholder },
    permissions: { titleKey: 'settings.section.permissions', icon: ShieldQuestion, pane: Placeholder },
    skills: { titleKey: 'settings.section.skills', icon: Sparkles, pane: Placeholder },
    connectors: { titleKey: 'settings.section.connectors', icon: Plug, pane: Placeholder },
    messaging: { titleKey: 'settings.section.messaging', icon: MessageSquare, pane: Placeholder },
    automations: { titleKey: 'settings.section.automations', icon: Clock, pane: Placeholder },
    memory: { titleKey: 'settings.section.memory', icon: Brain, pane: Placeholder },
    notifications: { titleKey: 'settings.section.notifications', icon: Bell, pane: Placeholder },
    voice: { titleKey: 'settings.section.voice', icon: Volume2, pane: Placeholder },
    privacy: { titleKey: 'settings.section.privacy', icon: Lock, pane: Placeholder },
    advanced: { titleKey: 'settings.section.advanced', icon: Wrench, pane: Placeholder },
    about: { titleKey: 'settings.section.about', icon: Info, pane: Placeholder },
};

export const SECTION_ORDER = Object.keys(SETTINGS_SECTIONS) as SectionId[];

export function isSectionId(value: unknown): value is SectionId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_SECTIONS, value);
}
