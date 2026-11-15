// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { MAX_MESSAGE_CHARS } from '@webui/utils/messageLimits';

import { useT } from '@/i18n/useT';
import { Button, IconButton, Notice, Row, Stack, Surface, TextField } from '@/ui';
import { ArrowUp, Square } from '@/ui/icons';

import { AttachButton } from './AttachButton';
import { AttachmentChips } from './AttachmentChips';
import { CompactChipsContext } from './ControlChip';
import type { Attachments } from './useAttachments';

export interface ComposerProps {
    /** Give `value` and `onChange` together to control the text; leave both out to let the composer keep it. */
    value?: string;
    onChange?(value: string): void;
    /** Returns false to keep the text in the box, as when an answer matches none of a question's choices. */
    onSend(text: string): boolean | void;
    onStop?(): void;
    /** A reply is running: Send queues the next message and Stop appears. */
    running?: boolean;
    /** Replaces the placeholder: `composer.queueNext` while running, else `composer.placeholder`. */
    placeholder?: string;
    /** Why the box can't be used right now; shown as the hint and the placeholder. */
    disabledReason?: string;
    /** GAIA waits on a question: Send answers it instead of queueing. */
    answering?: boolean;
    /** The chat is being created: the text stays editable and Send waits. */
    starting?: boolean;
    /** Files attached to the message: the + button, a chip each, and their links go out with the text. */
    attachments?: Attachments;
    leftControls?: ReactNode;
    rightControls?: ReactNode;
}

// About the web box's 240 px cap at the body text size.
const MAX_LINES = 9;

// Row flow follows the layout direction, so Arabic mirrors without left/right.
// Attach, Stop and Send keep their size; the chips give way first.
const FIXED: ViewStyle = { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 8 };
/** Below this width the chip row shows icons only; wider rows fit every label (a 390 pt phone's row is about 230). */
const COMPACT_CHIPS_BELOW = 300;
const CHIPS: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 8 };
const GROUP: ViewStyle = { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, gap: 8 };

export function Composer({
    value,
    onChange,
    onSend,
    onStop,
    placeholder: placeholderText,
    running = false,
    answering = false,
    disabledReason,
    starting = false,
    attachments,
    leftControls,
    rightControls,
}: ComposerProps) {
    const t = useT();
    const [own, setOwn] = useState('');
    const [stopping, setStopping] = useState(false);
    const [chipsWidth, setChipsWidth] = useState(0);
    const text = value ?? own;

    // Reset during render, so a later reply never starts out as Stopping.
    if (!running && stopping) setStopping(false);

    const setText = (next: string) => {
        if (value === undefined) setOwn(next);
        onChange?.(next);
    };

    const message = text.trim();
    // What goes out is the text plus a link for each uploaded file.
    const sent = attachments ? attachments.compose(message) : message;
    const tooLong = sent.length > MAX_MESSAGE_CHARS;
    const hasContent = message.length > 0 || !!attachments?.hasUploaded;
    const canSend = !disabledReason && !starting && !attachments?.uploading && hasContent && !tooLong;

    // Clears without blurring, so the keyboard stays up for the next message.
    const send = () => {
        if (!canSend) return;
        if (onSend(sent) !== false) {
            setText('');
            attachments?.clear();
        }
    };

    const stop = () => {
        setStopping(true);
        onStop?.();
    };

    const sendLabel = answering ? t('composer.sendAnswer') : running && message ? t('composer.queue') : t('composer.send');
    const placeholder = disabledReason ?? placeholderText ?? (running ? t('composer.queueNext') : t('composer.placeholder'));

    return (
        <Stack gap="sm" padding="md">
            {tooLong ? (
                <Notice
                    tone="danger"
                    title={t('composer.tooLong', {
                        sent: sent.length.toLocaleString(),
                        max: MAX_MESSAGE_CHARS.toLocaleString(),
                    })}
                    message={t('composer.tooLongHint')}
                    testID="composer-too-long"
                />
            ) : null}
            <Surface tone="card" border radius="xl" padding="sm">
                <Stack gap="xs">
                    {attachments ? <AttachmentChips attachments={attachments} /> : null}
                    <TextField
                        value={text}
                        onChangeText={setText}
                        placeholder={placeholder}
                        hint={disabledReason}
                        accessibilityLabel={t('composer.message')}
                        multiline
                        maxLines={MAX_LINES}
                        disabled={!!disabledReason}
                        bare
                        testID="composer-input"
                    />
                    <Row gap="sm" align="center">
                        <View style={FIXED}>{attachments ? <AttachButton onPick={attachments.add} disabled={!!disabledReason} /> : null}</View>
                        <View style={CHIPS} testID="composer-controls" onLayout={(e) => setChipsWidth(e.nativeEvent.layout.width)}>
                            <CompactChipsContext.Provider value={chipsWidth > 0 && chipsWidth < COMPACT_CHIPS_BELOW}>
                                <View style={GROUP}>{leftControls}</View>
                                <View style={GROUP}>{rightControls}</View>
                            </CompactChipsContext.Provider>
                        </View>
                        <View style={FIXED} testID="composer-actions">
                            {running ? (
                                <Button
                                    variant="danger"
                                    icon={Square}
                                    label={stopping ? t('composer.stopping') : t('composer.stop')}
                                    onPress={stop}
                                    disabled={stopping}
                                    testID="composer-stop"
                                />
                            ) : null}
                            <IconButton
                                variant="primary"
                                icon={ArrowUp}
                                label={sendLabel}
                                onPress={send}
                                busy={starting}
                                disabled={!canSend}
                                testID="composer-send"
                            />
                        </View>
                    </Row>
                </Stack>
            </Surface>
        </Stack>
    );
}
