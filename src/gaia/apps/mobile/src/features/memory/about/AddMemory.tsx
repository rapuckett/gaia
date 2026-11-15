// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useAddMemory } from '@/data';
import { useT } from '@/i18n/useT';
import { Button, Select, Stack, TextField } from '@/ui';
import { Plus } from '@/ui/icons';

import type { MemoryPaneProps } from '../tabs';
import { errorText } from './errorText';
import { parseWhen } from './whenInput';

/** The categories a person can add, in the web's order; "fact" is its "About you". */
const KINDS = [
    { value: 'fact', label: 'mem.about.group.about' },
    { value: 'preference', label: 'mem.about.kind.preference' },
    { value: 'reminder', label: 'mem.about.kind.reminder' },
    { value: 'note', label: 'mem.about.kind.note' },
] as const;

export function AddMemory({ notify }: Pick<MemoryPaneProps, 'notify'>) {
    const t = useT();
    const add = useAddMemory();
    const [text, setText] = useState('');
    const [category, setCategory] = useState('fact');
    const [when, setWhen] = useState('');
    const reminder = category === 'reminder';
    const due = reminder ? parseWhen(when) : null;
    const whenWrong = reminder && when.trim() !== '' && due === null;
    const ready = text.trim() !== '' && (!reminder || due !== null);

    const submit = () => {
        if (!ready || add.isPending) return;
        add.mutate(
            { content: text.trim(), category, ...(due ? { due_at: due } : {}) },
            {
                onSuccess: () => {
                    setText('');
                    setWhen('');
                    notify({ tone: 'success', text: t('mem.about.saved') });
                },
                onError: (error) => notify({ tone: 'danger', text: t('mem.about.addFailed', { error: errorText(error, t) }) }),
            },
        );
    };

    return (
        <Stack gap="md" testID="memory-about-add">
            <TextField
                value={text}
                onChangeText={setText}
                placeholder={t('mem.about.addPlaceholder')}
                accessibilityLabel={t('mem.about.addLabel')}
                multiline
                maxLines={4}
                testID="memory-about-add-text"
            />
            <Select
                label={t('mem.about.kind')}
                value={category}
                onChange={setCategory}
                options={KINDS.map((kind) => ({ value: kind.value, label: t.bare(kind.label) }))}
                testID="memory-about-add-kind"
            />
            {reminder ? (
                <TextField
                    value={when}
                    onChangeText={setWhen}
                    label={t('mem.about.when')}
                    placeholder="2026-11-20 09:00"
                    hint={t('mobileApp.mem.whenHint')}
                    error={whenWrong ? t('mobileApp.mem.whenHint') : undefined}
                    testID="memory-about-add-when"
                />
            ) : null}
            <Stack align="start">
                <Button
                    label={t.bare('mem.about.add')}
                    accessibilityLabel={t('mem.about.add')}
                    icon={Plus}
                    variant="primary"
                    disabled={!ready}
                    busy={add.isPending}
                    onPress={submit}
                    testID="memory-about-add-submit"
                />
            </Stack>
        </Stack>
    );
}
