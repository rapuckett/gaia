// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ComponentType } from 'react';

import type { LucideIcon } from '@/ui/icons';
import { Bell, Brain, Clock, Cpu, Info, ListChecks, Lock, MessageSquare, Plug, ShieldQuestion, SlidersHorizontal, Sparkles, Volume2, Wrench } from '@/ui/icons';

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
    /** The one place a pane is wired: a set-* task swaps its entry's import for the real pane. */
    load: () => Promise<{ default: ComponentType }>;
}

const placeholder = () => import('./panes/Placeholder');

export const SETTINGS_SECTIONS: Record<SectionId, SettingsSectionEntry> = {
    general: { titleKey: 'settings.section.general', icon: SlidersHorizontal, load: placeholder },
    setup: { titleKey: 'settings.section.setup', icon: ListChecks, load: placeholder },
    model: { titleKey: 'settings.section.model', icon: Cpu, load: placeholder },
    permissions: { titleKey: 'settings.section.permissions', icon: ShieldQuestion, load: placeholder },
    skills: { titleKey: 'settings.section.skills', icon: Sparkles, load: placeholder },
    connectors: { titleKey: 'settings.section.connectors', icon: Plug, load: placeholder },
    messaging: { titleKey: 'settings.section.messaging', icon: MessageSquare, load: placeholder },
    automations: { titleKey: 'settings.section.automations', icon: Clock, load: placeholder },
    memory: { titleKey: 'settings.section.memory', icon: Brain, load: placeholder },
    notifications: { titleKey: 'settings.section.notifications', icon: Bell, load: placeholder },
    voice: { titleKey: 'settings.section.voice', icon: Volume2, load: placeholder },
    privacy: { titleKey: 'settings.section.privacy', icon: Lock, load: placeholder },
    advanced: { titleKey: 'settings.section.advanced', icon: Wrench, load: placeholder },
    about: { titleKey: 'settings.section.about', icon: Info, load: placeholder },
};

export const SECTION_ORDER = Object.keys(SETTINGS_SECTIONS) as SectionId[];

export function isSectionId(value: unknown): value is SectionId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_SECTIONS, value);
}
