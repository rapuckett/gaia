// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';

import { keepTogether, ref, type MessageKey, type Params, type Say } from '@webui/i18n/registry';
import { dueInputValue, dueLabel, relativeDay, sourceKey, type AboutYouItem } from '@webui/utils/memoryFormat.core';

import { useEditMemory } from '@/data';
import { describeError, plainFailureText, translator, useT, type Translate } from '@/i18n/useT';
import { ActionSheet, Button, IconButton, Pressable, Row, Stack, Text, TextField, type SheetAction } from '@/ui';
import { Copy, Ellipsis, Eye, Pencil, Trash2 } from '@/ui/icons';

import type { MemoryPaneProps } from '../tabs';
import { parseWhen, whenText } from './whenInput';
import { ContentText } from '../ContentText';

/** A translator whose lookups are one language half of a `t.compose`, so a date inside them stays in that half. */
function sayAs(say: Say, code: string): Translate {
    return Object.assign((key: MessageKey, params?: Params) => say(key, params), translator(code)) as Translate;
}

interface MemoryRowProps extends Pick<MemoryPaneProps, 'notify'> {
    item: AboutYouItem;
    forgetting: boolean;
    onForget: (item: AboutYouItem) => void;
}

/** A formatted date stays whole when the line wraps; the "yesterday" and "3 days ago" refs are prose. */
const whenLabel = (when: ReturnType<typeof relativeDay>): string => (typeof when === 'string' ? keepTogether(when) : (when as unknown as string));

/** The small line under a memory: where it came from and when, each half in its own language. */
export function memoryMeta(item: AboutYouItem, t: Translate): string {
    const source = ref(sourceKey(item.source));
    return relativeDay(item.updated_at, t) === null
        ? t(sourceKey(item.source))
        : t.compose((say, code) => say('mem.about.meta', { source, when: whenLabel(relativeDay(item.updated_at, translator(code))) }));
}

/** One memory: its text (hidden when sensitive until tapped), what it came from and when, and Edit and Forget. */
export function MemoryRow({ item, forgetting, onForget, notify }: MemoryRowProps) {
    const t = useT();
    const edit = useEditMemory();
    const [revealed, setRevealed] = useState(false);
    const [editing, setEditing] = useState(false);
    const [menu, setMenu] = useState(false);
    const [draft, setDraft] = useState('');
    const [draftWhen, setDraftWhen] = useState('');
    const hidden = item.sensitive && !revealed;
    const reminder = item.category === 'reminder';
    const due = item.due_at ? dueLabel(item.due_at, new Date(), t) : null;
    const dueText = item.due_at ? t.compose((say, code) => dueLabel(item.due_at as string, new Date(), sayAs(say, code))?.text ?? '') : null;
    const meta = memoryMeta(item, t);
    const name = hidden ? t.bare('mem.about.sensitiveMemory') : item.content;

    const open = () => {
        setDraft(item.content);
        setDraftWhen(whenText(dueInputValue(item.due_at)));
        setEditing(true);
    };

    const nextDue = reminder && draftWhen.trim() ? parseWhen(draftWhen) : null;
    const dueChanged = reminder && nextDue !== null && nextDue !== dueInputValue(item.due_at);
    const dueWrong = reminder && draftWhen.trim() !== '' && nextDue === null;

    const save = () => {
        const content = draft.trim();
        if (!content || dueWrong) return;
        if (content === item.content && !dueChanged) {
            setEditing(false);
            return;
        }
        edit.mutate(
            { id: item.id, body: { ...(content !== item.content ? { content } : {}), ...(dueChanged && nextDue ? { due_at: nextDue } : {}) } },
            {
                onSuccess: () => {
                    setEditing(false);
                    notify({ tone: 'success', text: t('mem.about.updated') });
                },
                onError: (error) => notify({ tone: 'danger', text: plainFailureText(t, 'mem.about.editFailed', {}, error) }),
            },
        );
    };

    const copy = () =>
        Clipboard.setStringAsync(item.content).catch((error: unknown) => notify({ tone: 'danger', text: describeError(error, t) }));

    const actions: SheetAction[] = [
        { label: t('mobile.copy'), icon: Copy, disabled: hidden, onPress: copy, testID: `memory-about-copy-${item.id}` },
        { label: t('mem.about.edit'), icon: Pencil, disabled: hidden, onPress: open, testID: `memory-about-edit-open-${item.id}` },
        { label: t('mem.about.forget'), icon: Trash2, destructive: true, disabled: forgetting, onPress: () => onForget(item), testID: `memory-about-forget-${item.id}` },
    ];

    return (
        <Stack testID={`memory-about-row-${item.id}`}>
            <Stack gap="sm" paddingX="lg" paddingY="md">
                {editing ? (
                    <Stack gap="md">
                        <TextField
                            value={draft}
                            onChangeText={setDraft}
                            accessibilityLabel={t('mem.about.editLabel')}
                            multiline
                            maxLines={6}
                            autoFocus
                            testID={`memory-about-edit-${item.id}`}
                        />
                        {reminder ? (
                            <TextField
                                value={draftWhen}
                                onChangeText={setDraftWhen}
                                label={t('mem.about.when')}
                                hint={t('mobileApp.mem.whenHint')}
                                error={dueWrong ? t('mobileApp.mem.whenHint') : undefined}
                            />
                        ) : null}
                        <Row gap="sm" wrap stack>
                            <Button label={t.bare('mem.about.save')} accessibilityLabel={t('mem.about.save')} variant="primary" size="sm" busy={edit.isPending} disabled={!draft.trim() || dueWrong} onPress={save} testID={`memory-about-save-${item.id}`} />
                            <Button label={t.bare('mem.about.cancel')} accessibilityLabel={t('mem.about.cancel')} variant="secondary" size="sm" disabled={edit.isPending} onPress={() => setEditing(false)} />
                        </Row>
                    </Stack>
                ) : (
                    <Row gap="sm" align="start">
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Pressable accessible={false} onLongPress={() => setMenu(true)} minSize={0}>
                                <Stack gap="sm">
                                    {hidden ? (
                                        <Row>
                                            <Button
                                                label={t.bare('mem.about.showSensitive')}
                                                accessibilityLabel={`${t('mem.about.showSensitive')}: ${t('mem.about.sensitiveMemory')}`}
                                                icon={Eye}
                                                variant="secondary"
                                                size="sm"
                                                onPress={() => setRevealed(true)}
                                                testID={`memory-about-reveal-${item.id}`}
                                            />
                                        </Row>
                                    ) : (
                                        <ContentText>{item.content}</ContentText>
                                    )}
                                    {due ? (
                                        <Text role="caption" tone={due.past ? 'danger' : 'muted'}>
                                            {dueText}
                                        </Text>
                                    ) : null}
                                    <Text role="caption" tone="muted">
                                        {meta}
                                    </Text>
                                    {hidden ? (
                                        <Text role="caption" tone="muted">
                                            {t.bare('mem.about.editHidden')}
                                        </Text>
                                    ) : null}
                                </Stack>
                            </Pressable>
                        </View>
                        <IconButton
                            icon={Ellipsis}
                            size="sm"
                            label={t('row.moreActions', { title: name })}
                            onPress={() => setMenu(true)}
                            testID={`memory-about-more-${item.id}`}
                        />
                    </Row>
                )}
            </Stack>
            <ActionSheet open={menu} onClose={() => setMenu(false)} actions={actions} />
        </Stack>
    );
}
