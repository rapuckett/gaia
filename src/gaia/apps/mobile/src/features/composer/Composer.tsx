// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';

import { MAX_MESSAGE_CHARS } from '@webui/utils/messageLimits';

import { useT } from '@/i18n/useT';
import { Button, IconButton, Notice, Row, Stack, TextField } from '@/ui';
import { ArrowUp, Square } from '@/ui/icons';

export interface ComposerProps {
    /** Give `value` and `onChange` together to control the text; leave both out to let the composer keep it. */
    value?: string;
    onChange?(value: string): void;
    onSend(text: string): void;
    onStop?(): void;
    /** A reply is running: Send queues the next message and Stop appears. */
    running?: boolean;
    /** Replaces the placeholder: `composer.queueNext` while running, else `composer.placeholder`. */
    placeholder?: string;
    /** Why the box can't be used right now; shown as the hint and the placeholder. */
    disabledReason?: string;
    /** The chat is being created: the text stays editable and Send waits. */
    starting?: boolean;
    leftControls?: ReactNode;
    rightControls?: ReactNode;
}

// About the web box's 240 px cap at the body text size.
const MAX_LINES = 9;

export function Composer({
    value,
    onChange,
    onSend,
    onStop,
    placeholder: placeholderText,
    running = false,
    disabledReason,
    starting = false,
    leftControls,
    rightControls,
}: ComposerProps) {
    const t = useT();
    const [own, setOwn] = useState('');
    const [stopping, setStopping] = useState(false);
    const text = value ?? own;

    // Reset during render, so a later reply never starts out as Stopping.
    if (!running && stopping) setStopping(false);

    const setText = (next: string) => {
        if (value === undefined) setOwn(next);
        onChange?.(next);
    };

    const message = text.trim();
    const tooLong = message.length > MAX_MESSAGE_CHARS;
    const canSend = !disabledReason && !starting && message.length > 0 && !tooLong;

    // Clears without blurring, so the keyboard stays up for the next message.
    const send = () => {
        if (!canSend) return;
        onSend(message);
        setText('');
    };

    const stop = () => {
        setStopping(true);
        onStop?.();
    };

    const placeholder = disabledReason ?? placeholderText ?? (running ? t('composer.queueNext') : t('composer.placeholder'));

    return (
        <Stack gap="sm" padding="md">
            {tooLong ? (
                <Notice
                    tone="danger"
                    title={t('composer.tooLong', {
                        sent: message.length.toLocaleString(),
                        max: MAX_MESSAGE_CHARS.toLocaleString(),
                    })}
                    message={t('composer.tooLongHint')}
                    testID="composer-too-long"
                />
            ) : null}
            <TextField
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                hint={disabledReason}
                accessibilityLabel={t('composer.message')}
                multiline
                maxLines={MAX_LINES}
                disabled={!!disabledReason}
                testID="composer-input"
            />
            <Row gap="sm" align="center" justify="between">
                <Row gap="sm" align="center" flex={1}>
                    {leftControls}
                </Row>
                <Row gap="sm" align="center">
                    {rightControls}
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
                        label={t('composer.send')}
                        onPress={send}
                        busy={starting}
                        disabled={!canSend}
                        testID="composer-send"
                    />
                </Row>
            </Row>
        </Stack>
    );
}
