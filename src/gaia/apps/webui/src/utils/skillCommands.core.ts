// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** A composer that holds only `/` and a skill name being typed. No DOM, so the phone shares it. */
const TYPING_COMMAND = /^\/[a-z0-9-]*$/i;

export function isTypingSkillCommand(value: string): boolean {
    return TYPING_COMMAND.test(value);
}

/** The skills whose /name starts with what is typed; none unless a command is being typed. */
export function matchSkillCommands<T extends { name: string }>(skills: readonly T[], value: string): T[] {
    if (!isTypingSkillCommand(value)) return [];
    const typed = value.toLowerCase();
    return skills.filter((s) => `/${s.name}`.startsWith(typed));
}

/** A skill description's first sentence: they are written for models and run long. */
export function firstSentence(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    const end = flat.indexOf('. ');
    return end >= 0 ? flat.slice(0, end + 1) : flat;
}
