// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '../i18n/registry';
import type { Schedule } from '../types';
import { log } from './logger';

/** Quick picks for "When to run"; the value is what the schedule parser reads. */
export const WHEN_PRESETS: Array<{ label: MessageKey; value: string }> = [
    { label: 'schedules.preset.morning', value: 'daily at 8am' },
    { label: 'schedules.preset.weekdays', value: 'weekdays at 9am' },
    { label: 'schedules.preset.hourly', value: 'every 1h' },
];

/** What the user typed when the schedule was made, so Edit starts from their own words. */
export function scheduleInputText(schedule: Schedule): string {
    if (schedule.schedule_config) {
        try {
            const raw = (JSON.parse(schedule.schedule_config) as { raw_input?: unknown }).raw_input;
            if (typeof raw === 'string' && raw.trim()) return raw;
        } catch (err) {
            log.ui.warn(`Schedule "${schedule.name}" has an unreadable schedule_config`, err);
        }
    }
    // Rows saved before the input was kept: the description reads back for most shapes, and the preview says if not.
    return schedule.description;
}
