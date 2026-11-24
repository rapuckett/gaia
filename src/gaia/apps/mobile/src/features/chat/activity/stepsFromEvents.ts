// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { AgentStep, StreamEvent } from '@webui/types';
import { isEchoOfFailedTool } from '@webui/utils/chatStream';
import { agentEventToStep, isProgressTick, statusText } from '@webui/utils/streamSteps.core';
import { toolResultUpdates } from '@webui/utils/toolEvents.core';

import type { Translate } from '@/i18n/useT';

/** Same as SPEECH_MODEL_DOWNLOADED_PHASE in audio_tools.py. */
const SPEECH_MODEL_DOWNLOADED = 'speech_model_downloaded';

/** Statuses that carry no step of their own: the live line or a stage report says them. */
function isSilentStatus(event: StreamEvent, text: string): boolean {
    if (event.status === 'history_cut' || event.phase === 'waiting') return true;
    if (event.phase === 'recording' || event.phase === 'recording_found') return true;
    if (isProgressTick(event) || text.toLowerCase().startsWith('executing ')) return true;
    return event.status !== 'working' && event.status !== 'warning' && event.status !== 'info';
}

/** A model retry is said by the live line alone, whether as its own status or as the warning beside it. */
function isRetryNotice(events: readonly StreamEvent[], i: number): boolean {
    const event = events[i]!;
    if (event.phase === 'model_retry') return true;
    if (event.status !== 'warning') return false;
    return [events[i - 1], events[i + 1]].some((e) => e?.phase === 'model_retry' && e.message === event.message);
}

/** *steps* with *step* just before the last tool call if it is still running, else at the end. */
function beforeRunningCall(steps: AgentStep[], step: AgentStep): AgentStep[] {
    let at = steps.length;
    for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i]!.type !== 'tool') continue;
        if (steps[i]!.active) at = i;
        break;
    }
    return [...steps.slice(0, at), step, ...steps.slice(at)];
}

/**
 * The turn's activity steps, from its events, the way the Agent UI's chat view
 * folds them into its step list while the turn runs.
 */
export function stepsFromEvents(events: readonly StreamEvent[], t: Translate): AgentStep[] {
    const ids = { current: 0 };
    let steps: AgentStep[] = [];
    const add = (step: AgentStep | null) => {
        if (!step) return;
        // A status or thought arriving mid-call doesn't end a running tool; its tool_end does.
        steps = [
            ...steps.map((s) => (s.active && s.type === 'tool' && step.type !== 'tool' && s.success == null && !s.result ? s : { ...s, active: false })),
            step,
        ];
    };
    const updateLast = (updates: Partial<AgentStep>) => {
        if (steps.length) steps = [...steps.slice(0, -1), { ...steps[steps.length - 1]!, ...updates }];
    };
    const updateLastTool = (updates: Partial<AgentStep>) => {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i]!.type !== 'tool') continue;
            steps = steps.map((s, j) => (j === i ? { ...s, ...updates } : s));
            return;
        }
    };

    for (const [i, event] of events.entries()) {
        if (event.type === 'status' && isRetryNotice(events, i)) continue;
        switch (event.type) {
            case 'tool_end':
                updateLastTool({ active: false, success: event.success !== false });
                break;
            case 'tool_result':
                updateLastTool(toolResultUpdates(event));
                break;
            case 'tool_args': {
                const hasArgs = !!event.args && Object.keys(event.args).length > 0;
                const detail = event.detail || (hasArgs ? JSON.stringify(event.args) : '');
                updateLastTool({ ...(detail ? { detail } : {}), ...(event.narration ? { narration: event.narration } : {}) });
                break;
            }
            case 'skill_use': {
                const step = event.how === 'model' ? null : agentEventToStep(event, ids, t);
                if (!step) break;
                // The pickup sits before the call it belongs to while that call runs.
                let at = steps.length;
                for (let i = steps.length - 1; i >= 0; i--) {
                    if (steps[i]!.type !== 'tool') continue;
                    if (steps[i]!.active) at = i;
                    break;
                }
                steps = [...steps.slice(0, at), step, ...steps.slice(at)];
                break;
            }
            case 'thinking': {
                const last = steps[steps.length - 1];
                if (last?.type === 'thinking') {
                    const prior = last.detail ?? '';
                    const gap = !last.active && last.latencyMs != null && /\S$/.test(prior) && /^\S/.test(event.content ?? '') ? '\n\n' : '';
                    updateLast({ detail: prior + gap + (event.content ?? ''), active: true, latencyMs: undefined });
                } else add(agentEventToStep(event, ids, t));
                break;
            }
            case 'status': {
                if (event.retracts_answer) {
                    add(agentEventToStep({ type: 'status', status: 'warning', message: t('live.answerRestarted') } as StreamEvent, ids, t));
                    break;
                }
                if (event.phase === SPEECH_MODEL_DOWNLOADED && event.message) {
                    // A download the user waited on stays in the turn's steps, above the call it finished inside.
                    const done: AgentStep = {
                        id: ++ids.current, type: 'status', label: event.message, active: false, success: true, kept: true, timestamp: Date.now(),
                    };
                    const last = steps[steps.length - 1];
                    if (last?.type === 'status' && last.active) updateLast({ ...done, id: last.id, detail: undefined });
                    else steps = beforeRunningCall(steps, done);
                    break;
                }
                const text = statusText(event, t);
                if (isSilentStatus(event, text)) break;
                const last = steps[steps.length - 1];
                if (last?.type === 'status' && last.active && event.status !== 'warning') updateLast({ label: text || t('activity.working'), detail: text });
                else if (last?.type === 'thinking' && last.active) updateLast({ label: text || t('activity.thinking') });
                else add(agentEventToStep({ ...event, message: text }, ids, t));
                break;
            }
            case 'step':
                break;
            case 'agent_error':
                if (!isEchoOfFailedTool(event, steps)) add(agentEventToStep(event, ids, t));
                break;
            default:
                if (['tool_start', 'commentary', 'plan', 'policy_alert'].includes(event.type)) add(agentEventToStep(event, ids, t));
        }
    }
    return steps;
}

/**
 * *steps* as they stand once the turn has ended: a step still running was cut off,
 * so it stops and keeps the time it had run at *endedAt*. The Agent UI has no shared
 * code for this; it labels such a step with `tool.unfinished` (agentActivity.core).
 */
export function endRunningSteps(steps: readonly AgentStep[], endedAt: number): AgentStep[] {
    return steps.map((s) => (s.active ? { ...s, active: false, latencyMs: Math.max(0, endedAt - s.timestamp) } : s));
}
