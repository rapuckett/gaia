// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
    AGENT_OPTIONS, agentInstalled, agentNeedsDownload, agentOff, type AgentOption, type AgentPick,
} from '@webui/components/setup/agentPrograms';
import { formatBytes } from '@webui/components/setup/format';

import type { AgentProgram, FlagshipAgent } from '@/api/client.types';
import { useAgentDownload, useAgentPrograms, useAgentProgramsRefused, useSetFlagshipAgent } from '@/data';
import { AgentDownloadRow } from '@/features/setup/steps/AgentDownloadRow';
import { useT } from '@/i18n/useT';
import { Badge, Button, Card, Disclosure, Ltr, Pressable, Row, Spinner, Stack, Surface, Text } from '@/ui';
import { Download } from '@/ui/icons';

import { isPcRefusal, PcOnlyNotice } from '../../PcOnlyNotice';
import { blockedLine, downloadNote, failureLine, programName, type AgentLine } from './agentText';

export interface AgentChoiceProps {
    /** In Settings: a gaiacpp not on the PC has a Download button, and the PC switches to it once that finishes. */
    inSettings?: boolean;
    disabled?: boolean;
    /** Setup: the agent picked here, held until Continue; null keeps the one in use. */
    pending?: FlagshipAgent | null;
    onPending?: (pick: AgentPick | null) => void;
}

interface RowProps {
    option: AgentOption;
    program: AgentProgram | undefined;
    selected: boolean;
    pickable: boolean;
    /** Why the row can't be picked, or what picking it does: read with the row. */
    hint?: string;
    /** Setup only: a gaiacpp that can be had says it isn't downloaded yet. */
    showNotDownloaded: boolean;
    onPress: () => void;
}

/** One full-width radio row: the program's name, what it is, its size and tags. */
function AgentRow({ option, program, selected, pickable, hint, showNotDownloaded, onPress }: RowProps) {
    const t = useT();
    const off = agentOff(program);
    const size = program?.size_bytes ?? null;
    return (
        <Pressable
            onPress={onPress}
            disabled={!pickable}
            accessibilityRole="radio"
            accessibilityLabel={`${programName(option.id)} ${t(option.label)}`}
            accessibilityHint={hint}
            aria-checked={selected}
            testID={`agent-choice-${option.id}`}
        >
            <Surface tone={selected ? 'accent' : 'card'} border={selected ? 'accent' : true} radius="md" padding="md">
                <Row gap="sm" align="start">
                    <Text tone={selected ? 'accent' : 'muted'}>{selected ? '\u25CF' : '\u25CB'}</Text>
                    <Stack gap="xs" flex={1}>
                        <Row gap="sm" wrap align="center">
                            <Text role="ui" weight="semibold" tone={off ? 'muted' : undefined}>{programName(option.id)}</Text>
                            <Text role="ui" tone={off ? 'muted' : 'secondary'}>{t(option.label)}</Text>
                            {size != null ? <Ltr>{formatBytes(size)}</Ltr> : null}
                        </Row>
                        <Row gap="sm" wrap>
                            <Badge tone="accent" label={t.bare(option.tag)} accessibilityLabel={t(option.tag)} />
                            {off ? <Badge label={t.bare('setup.agent.notInstalled')} accessibilityLabel={t('setup.agent.notInstalled')} /> : null}
                            {showNotDownloaded ? <Badge label={t.bare('settings.model.notDownloaded')} accessibilityLabel={t('settings.model.notDownloaded')} /> : null}
                        </Row>
                    </Stack>
                </Row>
            </Surface>
        </Pressable>
    );
}

function Line({ line, tone = 'secondary' }: { line: AgentLine; tone?: 'secondary' | 'danger' }) {
    return (
        <Stack gap="xs">
            <Text role="caption" tone={tone}>{line.text}</Text>
            {line.detail ? <Text role="caption" tone="muted" dir="ltr" align="ltr" selectable>{line.detail}</Text> : null}
        </Stack>
    );
}

/** Which program runs the GAIA agent on the PC: the Python one or the native C++ one. */
export function AgentChoice({ inSettings = false, disabled = false, pending = null, onPending }: AgentChoiceProps) {
    const t = useT();
    const refused = useAgentProgramsRefused();
    const programs = useAgentPrograms();
    const save = useSetFlagshipAgent();
    const [open, setOpen] = useState(false);
    const [saveFailure, setSaveFailure] = useState<unknown>(null);
    const [savePcOnly, setSavePcOnly] = useState(false);
    const listing = programs.data;

    const switchTo = (id: FlagshipAgent) => {
        setSaveFailure(null);
        setSavePcOnly(false);
        save.mutate(id, { onError: (err) => (isPcRefusal(err) ? setSavePcOnly(true) : setSaveFailure(err)) });
    };

    // Switch only after a download started here with Download; one followed in is only shown.
    const { refetch } = programs;
    const download = useAgentDownload((startedHere) => {
        void refetch().then(() => {
            if (startedHere) switchTo('gaiacpp');
        });
    });
    const { follow } = download;

    // A download already running (from the PC, or setup) is followed, not started again.
    const followed = useRef(false);
    useEffect(() => {
        if (!inSettings || !listing || followed.current) return;
        followed.current = true;
        follow(listing.download);
    }, [inSettings, listing, follow]);

    const title = (
        <Row gap="sm" align="center">
            <Text role="ui" weight="semibold" accessibilityRole="header">{t('setup.agent.title')}</Text>
            {save.isPending || (!listing && programs.isFetching) ? <Spinner size="sm" /> : null}
        </Row>
    );
    const frame = (children: ReactNode) => (
        <Stack gap="md" testID="agent-choice">
            {title}
            {children}
        </Stack>
    );
    const card = (children: ReactNode) => (inSettings ? <Card padding="md">{frame(children)}</Card> : frame(children));

    if (refused || isPcRefusal(programs.error)) return card(<PcOnlyNotice testID="agent-choice-pc-only" />);
    if (programs.error) return card(<Line line={failureLine('setup.agent.loadFailed', programs.error, t)} tone="danger" />);
    if (!listing) return card(null);

    // A Download the PC refused for this phone puts the row back as it was, with "Change this on the PC".
    const downloadPcOnly = isPcRefusal(download.failure);
    const job = downloadPcOnly ? null : download.job;
    const downloading = job?.state === 'downloading';
    const program = (id: FlagshipAgent) => listing.programs.find((p) => p.id === id);
    const selected = pending ?? listing.current;
    const cpp = program('gaiacpp');
    const note = downloadNote(cpp, inSettings, t);
    const blocked = cpp && agentOff(cpp) ? blockedLine(cpp, t) : null;
    const busy = inSettings && (save.isPending || downloading);

    const choose = (id: FlagshipAgent) => {
        const p = program(id);
        if (!p || disabled || agentOff(p)) return;
        // Setup saves nothing here: Continue gets the agent and saves it before setup's own test runs.
        if (!inSettings) {
            onPending?.(id === listing.current ? null : { id, download: !agentInstalled(p), current: listing.current });
            return;
        }
        if (busy || agentNeedsDownload(p, true)) return;
        if (id !== listing.current) switchTo(id);
    };

    return card(
        <>
            <Stack gap="sm" accessibilityRole="radiogroup">
                {AGENT_OPTIONS.map((o) => {
                    const p = program(o.id);
                    const off = agentOff(p);
                    const getIt = agentNeedsDownload(p, inSettings);
                    const row = (
                        <AgentRow
                            key={o.id}
                            option={o}
                            program={p}
                            selected={selected === o.id}
                            pickable={!!p && !off && !getIt && !disabled && !busy}
                            hint={off ? blocked?.text : o.id === 'gaiacpp' ? (note ?? undefined) : undefined}
                            showNotDownloaded={!!p && !inSettings && !agentInstalled(p) && !off}
                            onPress={() => choose(o.id)}
                        />
                    );
                    // A greyed-out row that doesn't say why reads as broken.
                    if (off && blocked) {
                        return (
                            <Stack key={o.id} gap="xs">
                                {row}
                                <Line line={blocked} />
                            </Stack>
                        );
                    }
                    // While its download runs, or after it failed, the row below has the bar or Retry instead.
                    if (!getIt || downloading || job?.state === 'failed') return row;
                    return (
                        <Stack key={o.id} gap="xs">
                            {row}
                            <Row gap="sm">
                                <Button
                                    label={t('setup.agent.download')}
                                    accessibilityLabel={t('setup.agent.downloadNamed', { name: programName(o.id) })}
                                    icon={Download}
                                    variant="secondary"
                                    size="sm"
                                    disabled={save.isPending || disabled}
                                    onPress={() => void download.start()}
                                    testID="agent-choice-download"
                                />
                            </Row>
                        </Stack>
                    );
                })}
            </Stack>
            {downloadPcOnly ? <PcOnlyNotice testID="agent-choice-download-pc-only" /> : null}
            {job && (job.state === 'downloading' || job.state === 'failed') ? (
                <AgentDownloadRow
                    job={job}
                    name="gaiacpp"
                    onRetry={() => void download.start()}
                    failedNote={inSettings ? t('setup.agent.stays', { name: programName(listing.current) }) : undefined}
                    interrupted={download.interrupted}
                    failure={download.failure}
                />
            ) : null}
            <Disclosure title={t('setup.agent.compare')} open={open} onToggle={() => setOpen((v) => !v)}>
                <Stack gap="sm">
                    {AGENT_OPTIONS.map((o) => (
                        <Stack key={o.id} gap="xs">
                            <Text role="caption" tone="secondary">{t(o.more, { name: programName(o.id) })}</Text>
                            {o.id === 'gaiacpp' && note ? <Text role="caption" tone="secondary">{note}</Text> : null}
                        </Stack>
                    ))}
                    <Text role="caption" tone="secondary">{t(inSettings ? 'settings.agent.nextMessage' : 'setup.agent.hint')}</Text>
                </Stack>
            </Disclosure>
            {savePcOnly ? <PcOnlyNotice testID="agent-choice-save-pc-only" /> : null}
            {saveFailure ? <Line line={failureLine('setup.agent.saveFailed', saveFailure, t)} tone="danger" /> : null}
        </>,
    );
}
