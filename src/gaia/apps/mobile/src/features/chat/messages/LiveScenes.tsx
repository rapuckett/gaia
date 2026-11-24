// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import type { AgentStep } from '@webui/types';

import { GaiaApiError, GaiaNetworkError, GaiaStreamDroppedError, GaiaTurnError, type GaiaError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { Divider, Screen, Stack, UIProvider } from '@/ui';

import { ActivityTimeline } from '../activity/ActivityTimeline';
import { FIXTURES } from './__fixtures__/messages';
import { MessageListView } from './MessageList';
import { JumpButton } from './JumpButton';
import { MessageActionsContext } from './MessageActionsContext';
import { TailIssues } from '../ReplyErrors';
import { buildTail, serverDownReplyId } from '../tailState';
import type { TurnTail as Tail } from '../tailState';
import { TurnTail } from '../TurnTail';

/**
 * Developer scenes (`/dev/messages?state=`) for how a turn ends and what its activity shows.
 * `stopped` (CV-33): stopped, unconfirmed and stop-failed notes; the first has Continue and Try again.
 * `reply-errors` (CV-40): one failed turn per error kind (stream, context, model server, connection, timeout, unknown).
 * `activity-terminal` (CV-43): `#tap=step-row-0` opens the shell step with its exit code and Copy output.
 * `activity-plan` (CV-44): a live turn with the plan checklist. `activity-thinking` (CV-45): a live thought, then a finished one folded into its call. The live thought opens with `#tap=step-thought-0`; the folded one opens with `#tap=step-row-1`, and its text is `step-thought-1`.
 * `activity-filter` (CV-48): `#tap=steps-summary` opens the seven finished calls and shows the filter.
 * `reply-server-down` (CV-14): a failed latest reply with the model-server fix under it and Try again; `reply-errors` also shows the unexpected-error "Report it on GitHub" link (CV-30, `report-github`).
 * `activity-variants` (CV-42): `#tap=steps-summary` opens a thought-first call, a failed call and a repeated one (x3); `#tap=steps-summary,step-row-1` expands the thought-first call to its thought, tool and arguments (the thought is row 0); `#tap=steps-summary,step-row-2` expands the failed one.
 * `latest-answer` (regenerate): a short exchange; only the latest answer has Try again (`regenerate`), and its retry does nothing.
 * `activity-vision` (CV-49): the vision offer under a tool step. `many-scrolled-up` (CV-09): the many-messages list with the jump button showing.
 */
export const LIVE_SCENES = [
    'stopped',
    'reply-errors',
    'activity-terminal',
    'activity-plan',
    'activity-thinking',
    'activity-filter',
    'activity-variants',
    'activity-vision',
    'many-scrolled-up',
    'reply-server-down',
    'latest-answer',
] as const;
export type LiveScene = (typeof LIVE_SCENES)[number];

const LISTS: readonly LiveScene[] = ['many-scrolled-up', 'reply-server-down', 'latest-answer'];
const noop = () => undefined;
const LATEST_ANSWER_ACTIONS = { send: () => false, retry: () => Promise.resolve(true), busy: false };
const step = (id: number, extra: Partial<AgentStep>): AgentStep => ({ id, type: 'tool', label: 'Using tool', active: false, success: true, timestamp: id, ...extra });

const TAIL: Tail = { live: false, text: '', events: [], replyId: 1, canTryAgain: false, canContinue: false };

const ERRORS: [string, GaiaError][] = [
    ['stream', new GaiaStreamDroppedError(new Error('socket closed'))],
    ['context', new GaiaTurnError('request exceeds the available context size')],
    ['model_server', new GaiaTurnError('Lemonade server is not reachable')],
    ['connection', new GaiaNetworkError('http://pc.local', new TypeError('Failed to fetch'))],
    ['timeout', new GaiaTurnError('The request timed out')],
    ['unknown', new GaiaTurnError('Something unexpected')],
];

const TERMINAL: AgentStep[] = [
    step(1, {
        tool: 'run_shell_command',
        narration: 'Listing the reports folder',
        success: false,
        result: 'exit 2',
        commandOutput: { command: 'ls -la ~/Documents/reports', stdout: 'total 16\ndrwxr-xr-x  4 avery  staff  128 Nov 14 10:00 .\n-rw-r--r--  1 avery  staff  2048 Nov 14 10:00 q3.md', stderr: 'ls: ~/Documents/reports/old: Permission denied', returnCode: 2 },
    }),
];

const LIVE_SINCE = 64_000;
const PLAN = (): AgentStep[] => [
    step(1, {
        type: 'plan',
        label: 'Plan',
        planSteps: ['Find the Q3 files', 'Read the summary', 'Draft the update', 'Save it to the folder'],
        planNarrations: ['Finding the Q3 files', 'Reading the summary', 'Drafting the update', 'Saving it to the folder'],
        currentStep: 2,
        active: true,
        timestamp: Date.now() - LIVE_SINCE,
    }),
    step(2, { tool: 'write_file', narration: 'Drafting the update', active: true, success: undefined, timestamp: Date.now() - LIVE_SINCE }),
];

const THINKING_LIVE = (): AgentStep[] => [step(1, { type: 'thinking', label: 'Thinking', detail: 'The summary mentions two forecasts, so I should compare them before drafting.', active: true, success: undefined, timestamp: Date.now() - LIVE_SINCE })];
const THINKING_DONE: AgentStep[] = [
    step(1, { type: 'thinking', label: 'Thinking', detail: 'The file is small enough to read whole, so I will skip searching.', timestamp: 1000 }),
    step(2, { tool: 'read_file', narration: 'Reading forecast.csv', detail: 'path: forecast.csv', result: 'done', timestamp: 4000 }),
];

const NAMES = ['read_file', 'search_files', 'list_dir', 'read_file', 'write_file', 'search_files', 'list_dir'];
const FILTER: AgentStep[] = NAMES.map((tool, i) => step(i + 1, { tool, detail: `path: file-${i + 1}.md`, narration: `Step ${i + 1}`, success: i !== 4, result: i === 4 ? 'Permission denied' : 'done' }));

const VARIANTS: AgentStep[] = [
    step(1, { type: 'thinking', label: 'Thinking', detail: 'The file is small enough to read whole, so I will skip searching.', timestamp: 1000 }),
    step(2, { tool: 'read_file', narration: 'Reading forecast.csv', detail: 'path: forecast.csv', result: 'done', timestamp: 4000 }),
    step(3, { tool: 'write_file', narration: 'Saving the summary', detail: 'path: summary.md', success: false, result: 'Permission denied', timestamp: 5000 }),
    ...[6, 7, 8].map((id) => step(id, { tool: 'search_files', narration: 'Searching the reports folder', detail: 'query: Q3', result: 'done', timestamp: id * 1000 })),
];

const VISION: AgentStep[] = [step(1, { tool: 'analyze_image', narration: 'Reading photo.jpg', success: false, needsModel: 'vision', result: 'A vision model is needed.' })];

function Body({ state }: { state: LiveScene }) {
    if (state === 'stopped') {
        return (
            <Stack gap="md">
                <TurnTail tail={{ ...TAIL, stop: { state: 'stopped' }, canContinue: true, canTryAgain: true }} line={null} onTryAgain={noop} onContinue={noop} />
                <Divider />
                <TurnTail tail={{ ...TAIL, stop: { state: 'unconfirmed' } }} line={null} onTryAgain={noop} onContinue={noop} />
                <Divider />
                <TurnTail tail={{ ...TAIL, stop: { state: 'stopped', error: new GaiaApiError(500, 'stop failed') } }} line={null} onTryAgain={noop} onContinue={noop} />
            </Stack>
        );
    }
    if (state === 'reply-errors') {
        return (
            <Stack gap="md">
                {ERRORS.map(([kind, error]) => {
                    const tail: Tail = { ...TAIL, error, failedReply: true, canTryAgain: true };
                    return (
                        <Stack key={kind} gap="xs" testID={`reply-error-${kind}`}>
                            <TurnTail tail={tail} line={null} onTryAgain={noop} onContinue={noop} />
                            <TailIssues tail={tail} local={false} />
                            <Divider />
                        </Stack>
                    );
                })}
            </Stack>
        );
    }
    if (state === 'reply-server-down') {
        const messages = FIXTURES['failed-report'].messages;
        const tail = buildTail(messages, { status: 'idle', liveText: '', events: [], error: null, failed: true, failure: 'model_server_down', policyAlert: undefined, stopState: undefined, stopError: undefined });
        return (
            <MessageListView
                messages={messages}
                loading={false}
                fixShownBelowId={serverDownReplyId(tail)}
                live={
                    tail ? (
                        <>
                            <TurnTail tail={tail} line={null} onTryAgain={noop} onContinue={noop} />
                            <TailIssues tail={tail} local={false} />
                        </>
                    ) : undefined
                }
            />
        );
    }
    if (state === 'latest-answer') {
        return (
            <MessageActionsContext.Provider value={LATEST_ANSWER_ACTIONS}>
                <MessageListView messages={FIXTURES.short.messages} loading={false} />
            </MessageActionsContext.Provider>
        );
    }
    if (state === 'many-scrolled-up') {
        return (
            <Stack flex={1}>
                <MessageListView messages={FIXTURES.many.messages} loading={false} />
                <JumpButton visible onPress={noop} areaHeight={600} />
            </Stack>
        );
    }
    if (state === 'activity-thinking') {
        return (
            <Stack gap="md">
                <ActivityTimeline steps={THINKING_LIVE()} running />
                <Divider />
                <ActivityTimeline steps={THINKING_DONE} />
            </Stack>
        );
    }
    const steps = state === 'activity-terminal' ? TERMINAL : state === 'activity-plan' ? PLAN() : state === 'activity-filter' ? FILTER : state === 'activity-variants' ? VARIANTS : VISION;
    return <ActivityTimeline steps={steps} running={state === 'activity-plan'} />;
}

export function LiveScenes({ state }: { state: LiveScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => createFakeClient({}));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Screen scroll={!LISTS.includes(state)}>
                        <Stack gap="md" paddingX="gutter" paddingY="md" flex={LISTS.includes(state) ? 1 : undefined}>
                            <Body state={state} />
                        </Stack>
                    </Screen>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
