// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import type { ParsedSchedule, Schedule } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { useCreateSchedule, useEditSchedule, useGaiaClient } from '@/data';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { useAnnounce } from '@/platform/useAnnounce';
import { isolateUnit } from '@webui/i18n/registry';
import { WHEN_PRESETS, scheduleInputText } from '@webui/utils/scheduleForm.core';

import { Button, Chip, Notice, Row, Sheet, Stack, Text, TextField } from '@/ui';

import { composeDateLocale, describeSchedule, formatNextClock, formatTime } from './scheduleText';

const PARSE_DEBOUNCE_MS = 400;

type Preview = { status: 'idle' } | { status: 'parsing' } | { status: 'done'; parsed: ParsedSchedule } | { status: 'failed' };

const deviceTimeZone = (): string | undefined => Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;

/** Reads the "when to run" text on the PC after the typing pauses, so the preview follows what is written. */
function usePreview(input: string): Preview {
    const client = useGaiaClient();
    const [answer, setAnswer] = useState<{ input: string; result: Exclude<Preview, { status: 'idle' | 'parsing' }> } | null>(null);
    useEffect(() => {
        if (!input.trim() || !client) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            client
                .parseSchedule(input, deviceTimeZone(), { signal: controller.signal })
                .then((parsed) => setAnswer({ input, result: { status: 'done', parsed } }))
                .catch(() => {
                    if (!controller.signal.aborted) setAnswer({ input, result: { status: 'failed' } });
                });
        }, PARSE_DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [client, input]);
    if (!input.trim() || !client) return { status: 'idle' };
    return answer?.input === input ? answer.result : { status: 'parsing' };
}

export interface NewScheduleSheetProps {
    open: boolean;
    onClose: () => void;
    /** Dev gallery only: opens with the form filled in. */
    initial?: { when: string; name: string; prompt: string };
    /** The schedule being changed; the sheet then saves in place and keeps its name. */
    editing?: Schedule;
}

export function NewScheduleSheet({ open, onClose, initial, editing }: NewScheduleSheetProps) {
    const t = useT();
    const createMutation = useCreateSchedule();
    const editMutation = useEditSchedule();
    const create = editing ? editMutation : createMutation;
    const [when, setWhen] = useState(editing ? scheduleInputText(editing) : (initial?.when ?? ''));
    const [name, setName] = useState(editing?.name ?? initial?.name ?? '');
    const [prompt, setPrompt] = useState(editing?.prompt ?? initial?.prompt ?? '');
    const preview = usePreview(when);
    const parsed = preview.status === 'done' ? preview.parsed : null;
    const rejected = parsed !== null && !parsed.valid;
    const nextClock = parsed?.valid ? formatNextClock(parsed.next_run_at, new Date(), composeDateLocale(t.locale, t)) : null;
    const nameTaken = !editing && create.error instanceof GaiaApiError && create.error.status === 409;
    const formError = create.isError && !nameTaken ? describeHttpFailure(create.error, t) : null;
    useAnnounce(formError ? (editing ? t('schedules.editFailed') : formError.text) : null);
    // The backend validates on create, so only a parse that says no blocks it.
    const canCreate = when.trim() !== '' && name.trim() !== '' && prompt.trim() !== '' && !rejected && !create.isPending;

    const close = () => {
        create.reset();
        onClose();
    };

    const submit = () => {
        if (!canCreate) return;
        const done = {
            onSuccess: () => {
                if (!editing) {
                    setWhen('');
                    setName('');
                    setPrompt('');
                }
                close();
            },
        };
        const body = { interval: when.trim(), prompt: prompt.trim(), timezone: deviceTimeZone() };
        if (editing) editMutation.mutate({ name: editing.name, request: body }, done);
        else createMutation.mutate({ name: name.trim(), ...body }, done);
    };

    return (
        <Sheet
            open={open}
            onClose={close}
            scrollToEnd={formError !== null}
            scrollTestID="schedule-form-scroll"
            title={editing ? t('schedules.editingTitle', { name: isolateUnit(editing.name) }) : t('schedules.new')}
            footer={
                <Row gap="sm" justify="end" stack>
                    <Button label={t('schedules.cancel')} variant="ghost" onPress={close} />
                    <Button
                        label={t(editing ? (create.isPending ? 'schedules.saving' : 'schedules.save') : create.isPending ? 'schedules.creating' : 'schedules.create')}
                        variant="primary"
                        busy={create.isPending}
                        disabled={!canCreate}
                        testID="schedule-form-submit"
                        onPress={submit}
                    />
                </Row>
            }
        >
            <Stack gap="md">
                <Stack gap="xs">
                    <Text role="label" weight="medium" tone="secondary">
                        {t('schedules.when')}
                    </Text>
                    <Row gap="xs" wrap>
                        {WHEN_PRESETS.map((preset) => (
                            <Chip key={preset.value} label={t(preset.label)} selected={when.trim() === preset.value} onPress={() => setWhen(preset.value)} />
                        ))}
                    </Row>
                    <TextField
                        accessibilityLabel={t('schedules.when')}
                        value={when}
                        onChangeText={setWhen}
                        placeholder={t.bare('schedules.whenPlaceholder')}
                        hint={t('schedules.whenHint')}
                        multiline
                        maxLines={3}
                        autoFocus={!editing}
                    />
                </Stack>
                {preview.status === 'parsing' ? <Text role="caption" tone="muted">{t('schedules.parsing')}</Text> : null}
                {parsed?.valid ? (
                    <Stack gap="xs">
                        <Text role="body">{describeSchedule(parsed.description_parts, t) ?? parsed.description}</Text>
                        {parsed.next_run_at ? (
                            <Row gap="md" wrap>
                                <Text role="caption" tone="muted">
                                    {t.compose((say, code) =>
                                        say('schedules.nextRun', {
                                            when: formatTime(parsed.next_run_at, say, new Date(), composeDateLocale(code, t)),
                                        }),
                                    )}
                                </Text>
                                {nextClock ? (
                                    <Text role="caption" tone="muted">
                                        {nextClock}
                                    </Text>
                                ) : null}
                            </Row>
                        ) : null}
                    </Stack>
                ) : null}
                {rejected ? (
                    <Notice
                        tone="danger"
                        title={t('schedules.notUnderstood')}
                        message={/[A-Za-z]/.test(when) ? parsed.description : undefined}
                    />
                ) : null}
                <TextField
                    label={t('schedules.name')}
                    value={name}
                    onChangeText={(text) => {
                        setName(text);
                        if (nameTaken) create.reset();
                    }}
                    placeholder={t.bare('schedules.namePlaceholder')}
                    accessibilityLabel={t('schedules.namePlaceholder')}
                    error={nameTaken ? t('schedules.nameTaken') : undefined}
                    disabled={editing !== undefined}
                />
                <TextField
                    label={t('schedules.prompt')}
                    value={prompt}
                    onChangeText={setPrompt}
                    placeholder={t.bare('schedules.promptPlaceholder')}
                    accessibilityLabel={t('schedules.promptPlaceholder')}
                    multiline
                />
                {formError ? <Notice tone="danger" message={editing ? t('schedules.editFailed') : formError.text} detail={editing ? (formError.detail ?? formError.text) : formError.detail} /> : null}
            </Stack>
        </Sheet>
    );
}
