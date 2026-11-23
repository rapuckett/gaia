// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { useMemo, useState } from 'react';

import type { GaiaNotification } from '@webui/types/agent';
import { PATH_ACCESS_TOOL, PROJECT_TRUST_TOOL } from '@webui/utils/permissionPrompts.core';

import { UndoScene } from '@/features/settings/panes/UndoScene';
import { PermissionPrompt, type PermissionPromptProps } from '@/features/chat/permission/PermissionPrompt';
import { Screen, Stack, Text, UIProvider } from '@/ui';

const NOW = 1_700_000_000_000;

function prompt(id: string, fields: Partial<GaiaNotification>): GaiaNotification {
    return {
        id,
        type: 'permission_request',
        agentId: 'gaia',
        agentName: 'GAIA',
        title: '',
        message: '',
        timestamp: NOW,
        read: false,
        dismissed: false,
        priority: 'high',
        sessionId: 's1',
        confirmId: id,
        timeoutSeconds: 600,
        ...fields,
    };
}

const SHELL = prompt('shell', {
    tool: 'run_shell_command',
    toolArgs: { command: 'git status --short', working_directory: '/Users/alex/Projects/gaia', _risk_note: 'Reads the repository; changes nothing.' },
    alwaysScope: 'git status',
    summary: 'git status --short',
});
const WRITE = prompt('write', {
    tool: 'write_file',
    toolLabel: 'writing file',
    toolArgs: { file_path: '/Users/alex/Documents/notes.txt', content: 'Buy milk' },
    alwaysScope: 'write_file on notes.txt',
    risk: 'write',
});
const PATH = prompt('path', { tool: PATH_ACCESS_TOOL, toolArgs: { path: '/Users/alex/Documents/Team Docs', kind: 'folder' } });
const CALENDAR = (id: string, tool: string, toolArgs: Record<string, unknown>) =>
    prompt(id, { tool: `calendar/${tool}`, toolLabel: 'changing your calendar', toolArgs, alwaysScope: `calendar/${tool}` });
const LONG_ARGS = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`option_${i + 1}`, `value ${i + 1} for a long call`]));

interface Fixture {
    id: string;
    label: string;
    props: Omit<PermissionPromptProps, 'onAnswer'>;
}

function useFixtures(): Fixture[] {
    const [now] = useState(() => Date.now());
    return useMemo(
        () => [
            { id: 'shell', label: 'Shell command', props: { prompt: SHELL } },
            { id: 'write', label: 'File write, offers Always', props: { prompt: WRITE } },
            { id: 'path', label: 'Path access', props: { prompt: PATH } },
            { id: 'path-follow', label: 'Path access, follow-up', props: { prompt: { ...PATH, id: 'pf', pathFollowUp: true } } },
            {
                id: 'trust',
                label: 'Project trust',
                props: { prompt: prompt('trust', { tool: PROJECT_TRUST_TOOL, toolArgs: { path: '/Users/alex/Projects/gaia' } }) },
            },
            {
                id: 'fresh',
                label: 'Fresh consent, no Always',
                props: {
                    prompt: prompt('fresh', {
                        tool: 'share_engineering_context',
                        toolLabel: 'sharing engineering context',
                        toolArgs: { name: 'build-notes' },
                        alwaysScope: 'share_engineering_context',
                    }),
                },
            },
            {
                id: 'edit',
                label: 'File edit outside the chat folders',
                props: {
                    prompt: prompt('edit', {
                        tool: 'edit_file',
                        toolLabel: 'editing file',
                        toolArgs: {
                            file_path: '~/Projects/notes/plan.txt',
                            old_content: 'line one\nline two\nline three\n',
                            new_content: 'line one\nline two, edited with a much longer line that has to scroll sideways inside its box\nline three\nan added line\n',
                            _risk_note:
                                "~/Projects/notes/plan.txt is outside this chat's folders. Allowing this also lets GAIA use that file for the rest of the chat.",
                        },
                        summary: '~/Projects/notes/plan.txt',
                        alwaysScope: 'edit_file on plan.txt',
                    }),
                },
            },
            {
                id: 'calendar-create',
                label: 'Calendar: create an event, two people notified',
                props: {
                    prompt: CALENDAR('cal-create', 'create_calendar_event', {
                        title: 'Quarterly review', start: '2026-11-20T15:00:00-08:00', end: '2026-11-20T16:00:00-08:00', calendar_account: 'avery@example.com',
                        location: 'Room 4', description: 'Walk through the Q3 numbers.', notify_attendees: ['ada@example.com', 'grace@example.com'],
                    }),
                },
            },
            {
                id: 'calendar-update',
                label: 'Calendar: update an event',
                props: {
                    prompt: CALENDAR('cal-update', 'update_calendar_event', {
                        expected_title: 'Quarterly review', expected_start: '2026-11-20T15:00:00-08:00', calendar_account: 'avery@example.com',
                        new_title: 'Q3 review', new_start: '2026-11-21T10:00:00-08:00', new_end: '2026-11-21T11:00:00-08:00', new_location: 'Room 7',
                        notify_attendees: [],
                    }),
                },
            },
            {
                id: 'calendar-cancel',
                label: 'Calendar: cancel an event, one person notified',
                props: {
                    prompt: CALENDAR('cal-cancel', 'cancel_calendar_event', {
                        expected_title: 'Quarterly review', expected_start: '2026-11-20T15:00:00-08:00', calendar_account: 'avery@example.com', notify_attendees: ['ada@example.com'],
                    }),
                },
            },
            {
                id: 'names',
                label: 'A name hiding a zero-width joiner',
                props: {
                    prompt: prompt('names', {
                        tool: 'write_file',
                        toolLabel: 'writing file',
                        toolArgs: { file_path: '/Users/alex/Documents/inv‍oice.txt', content: 'Total: 120' },
                        alwaysScope: 'write_file on inv‍oice.txt',
                        risk: 'write',
                    }),
                },
            },
            {
                id: 'encoded',
                label: 'Encoded PowerShell command',
                props: {
                    prompt: prompt('encoded', {
                        tool: 'run_shell_command',
                        // "Remove-Item notes.txt" as UTF-16LE base64.
                        toolArgs: { command: 'powershell -EncodedCommand UgBlAG0AbwB2AGUALQBJAHQAZQBtACAAbgBvAHQAZQBzAC4AdAB4AHQA' },
                    }),
                },
            },
            {
                id: 'script',
                label: 'Python file that cannot be read',
                props: {
                    prompt: prompt('script', {
                        tool: 'execute_python_file',
                        toolArgs: { file_path: '/Users/alex/Projects/report.py', _script: { unreadable: 'too_large' } },
                    }),
                },
            },
            {
                id: 'mail',
                label: 'Email sent as written',
                props: {
                    prompt: prompt('mail', {
                        tool: 'send_now',
                        toolArgs: { _exact_text: 'From: alex@example.com\nTo: ada@example.com\nSubject: Q3 numbers\n\nHi Ada, the numbers are attached.' },
                    }),
                },
            },
            { id: 'repeats', label: 'Repeats 2', props: { prompt: WRITE, repeats: 2 } },
            { id: 'busy', label: 'Busy', props: { prompt: WRITE, busy: true } },
            { id: 'error', label: 'Error', props: { prompt: WRITE, error: 'GAIA could not reach the server. Check the connection and try again.' } },
            { id: 'ten', label: '10 seconds left', props: { prompt: { ...WRITE, id: 'ten', expiresAt: now + 10_000 } } },
            { id: 'expired', label: 'Expired', props: { prompt: { ...WRITE, id: 'exp', expiresAt: now - 1000 } } },
            { id: 'full', label: 'Full access pending', props: { prompt: SHELL, fullAccessPending: true } },
            {
                id: 'long',
                label: 'Long arguments',
                props: {
                    prompt: prompt('long', {
                        tool: 'run_python',
                        toolArgs: { code: Array.from({ length: 30 }, (_, i) => `print("line ${i + 1}")`).join('\n'), ...LONG_ARGS },
                        alwaysScope: 'run_python',
                    }),
                },
            },
        ],
        [now],
    );
}

export default function PermissionGalleryRoute() {
    const { only } = useLocalSearchParams<{ only?: string }>();
    const fixtures = useFixtures();
    const [last, setLast] = useState('none');
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if (only === 'undo') return <UndoScene />;
    const shown = only ? fixtures.filter((f) => f.id === only) : fixtures;
    return (
        <UIProvider>
            <Screen scroll>
                <Stack gap="xl" padding="lg">
                    <Text role="caption" tone="muted">{`Last answer: ${last}`}</Text>
                    {shown.map((f) => (
                        <Stack key={f.id} gap="sm">
                            <Text role="caption" tone="muted">{f.label}</Text>
                            <PermissionPrompt
                                {...f.props}
                                onAnswer={(choice) => setLast(`${f.id}: ${choice}`)}
                                onExpired={() => setLast(`${f.id}: expired`)}
                            />
                        </Stack>
                    ))}
                </Stack>
            </Screen>
        </UIProvider>
    );
}
