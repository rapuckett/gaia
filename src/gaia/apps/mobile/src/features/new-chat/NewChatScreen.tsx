// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { withStarter } from '@webui/components/tryChips.core';
import { bracketParts } from '@webui/i18n/registry';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, View, type ScrollView, TextInput } from 'react-native';

import type { PermissionMode } from '@/api/client.types';
import { useCreateSession, useDocuments, useGaiaClient, useMemorySettings, useStartScreen, useSystemStatus } from '@/data';
import { FlagshipAgentBanner } from '@/features/banners/FlagshipAgentBanner';
import { ModelRestoreNotice } from '@/features/model/ModelRestoreNotice';
import { Composer, FolderChip, ModelChip, PermissionChip, PrivateChip, useAttachments, useComposerQueue, useNextChatFolder } from '@/features/composer';
import { useNextChatDocs } from '@/features/documents';
import { QueuedMessages } from '@/features/composer/QueuedMessages';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { useLastChatStore } from '@/state/lastChat';
import { readNewChatDraft, writeNewChatDraft } from '@/state/newChatDraft';
import { useRouteNoticeStore } from '@/state/routeNotice';
import { Disclosure, IconButton, Notice, ProgressLine, Row, Screen, Stack, Surface, Text } from '@/ui';
import { DotGrid, type DimRect, type DotGridHandle } from '@/ui/controls/DotGrid';
import { X } from '@/ui/icons';

import { AgentRecovery } from './AgentRecovery';
import { DocumentBriefCard } from './DocumentBriefCard';
import { LibraryDocuments } from './LibraryDocuments';
import { greetingKey } from './greeting';
import { setupError } from './setupFailed';
import { showWarmUp, startingReason } from './starting';
import { TryChips } from './TryChips';
import { useAssistantNotice, useFirstSend } from './useNewChat';
import { shortModelName, warmUpLine, warmUpProgress } from './warmUp';

// How long the starter row holds its space for the PC's tasks.
const STARTERS_WAIT_MS = 3_000;

export interface NewChatScreenProps {
    // Opens the chat once its first message is under way.
    onOpen: (sessionId: string) => void;
    // Opens the document library, to choose what the new chat searches.
    onChooseDocuments: () => void;
    initialText?: string;
    // A skill's prompt goes in the box under any unsent draft; a new `id` adds it again.
    prompt?: { id: string; text: string };
    /** Starts with this opening message held until GAIA has started (developer gallery). */
    initialHeld?: string;
    /** Starts with the folder picker open (developer gallery). */
    initialPicking?: boolean;
}

export function NewChatScreen({ onOpen, onChooseDocuments, initialText = '', prompt, initialHeld, initialPicking }: NewChatScreenProps) {
    const t = useT();
    const status = useSystemStatus().data;
    const createSession = useCreateSession();
    const client = useGaiaClient();
    const startQuery = useStartScreen();
    const startScreen = startQuery.data;
    // A start screen that never answers must not leave the starter row blank for good.
    const [startSlow, setStartSlow] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setStartSlow(true), STARTERS_WAIT_MS);
        return () => clearTimeout(timer);
    }, []);
    const attachments = useAttachments();
    // The chat doesn't exist yet: these are applied as it is made.
    const [isPrivate, setPrivate] = useState(false);
    const memory = useMemorySettings();
    const [mode, setMode] = useState<PermissionMode>('ask');
    const documents = useDocuments().data?.documents;
    const attachedIds = useNextChatDocs((s) => s.ids);
    const holdDocuments = useNextChatDocs((s) => s.add);
    const dropDocument = useNextChatDocs((s) => s.remove);
    const queue = useComposerQueue(null);
    const { state, setText, submit } = useFirstSend(
        {
            createSession: async () => {
                const folder = useNextChatFolder.getState().path;
                const session = await createSession.mutateAsync({ document_ids: useNextChatDocs.getState().ids, private: isPrivate, folders: folder ? [folder] : [] });
                useNextChatDocs.getState().clear();
                useNextChatFolder.getState().set(null);
                if (mode !== 'ask') await client?.setPermissionMode(session.id, mode);
                return session;
            },
            deliver: queue.deliver,
            flush: queue.flush,
            queueHeld: queue.queueHeld,
            takeHeld: () => queue.takeHeld().map((item) => item.text),
        },
        initialText,
    );
    const assistant = useAssistantNotice();
    const routeNotice = useRouteNoticeStore((s) => s.notice);
    const dismissRouteNotice = useRouteNoticeStore((s) => s.dismiss);
    const [detailsOpen, setDetailsOpen] = useState(false);

    // A message sent while GAIA is still starting waits here, then goes out on its own.
    const starting = startingReason(status, t) !== null;
    const [held, setHeld] = useState<{ text: string } | null>(initialHeld ? { text: initialHeld } : null);
    const sentHeld = useRef<{ text: string } | null>(null);
    const heldOpening = starting ? (held?.text ?? null) : null;
    // While the chosen agent can't start a send would only fail: the text stays in the box, and nothing is held or queued.
    const agentProblem = assistant.agentProblem;
    const [keptForAgent, setKeptForAgent] = useState(false);
    // The card is the way out of a dead end: keep it, buttons and all, above the composer as it appears or grows.
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
    const showCard = useCallback(() => {
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    }, []);
    if (keptForAgent && agentProblem === null) setKeptForAgent(false);
    const send = useCallback(
        (message: string) => {
            if (agentProblem) {
                setKeptForAgent(true);
                // The keyboard shrinks the body and hides the card: close it, then bring the card back once the body has grown.
                if (Keyboard.isVisible()) {
                    const hidden = Keyboard.addListener('keyboardDidHide', () => {
                        hidden.remove();
                        showCard();
                    });
                    Keyboard.dismiss();
                }
                showCard();
                return false;
            }
            if (starting) setHeld({ text: message });
            else void submit(message, queue.hold);
        },
        [agentProblem, showCard, starting, submit, queue.hold],
    );
    useEffect(() => {
        if (starting || held === null || sentHeld.current === held) return;
        sentHeld.current = held;
        void submit(held.text, queue.hold);
    }, [starting, held, submit, queue.hold]);

    // Text in the box means the person started here, so the launch restore must not move them.
    const hasText = state.text !== '';
    useEffect(() => {
        if (hasText) useLastChatStore.getState().markNewChatChosen();
    }, [hasText]);

    // The unsent text survives a restart; sending empties the box, which forgets it. The gallery's seeded text isn't kept.
    const pcId = useConnectionStore((s) => s.connection?.pcId);
    const keepDraft = initialText === '' && !!pcId;
    const draftRead = useRef(false);
    useEffect(() => {
        if (!keepDraft) return undefined;
        let live = true;
        void readNewChatDraft(pcId).then((saved) => {
            if (live && saved) setText((current) => current || saved);
            if (live) draftRead.current = true;
        });
        return () => {
            live = false;
        };
    }, [keepDraft, pcId, setText]);
    const draftText = state.text;
    useEffect(() => {
        if (keepDraft && draftRead.current) writeNewChatDraft(pcId, draftText);
    }, [keepDraft, pcId, draftText]);

    useEffect(() => {
        if (state.open) onOpen(state.open);
    }, [state.open, onOpen]);

    const promptId = prompt?.id;
    const promptText = prompt?.text;
    useEffect(() => {
        if (promptText) setText((draft) => (draft.trim() ? `${draft}\n\n${promptText}` : promptText));
    }, [promptId, promptText, setText]);

    const lastExample = useRef('');
    const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
    const fillExample = useCallback(
        (example: string) => {
            setText((draft) => withStarter(draft, lastExample.current, example));
            lastExample.current = example;
            inputRef.current?.focus();
        },
        [setText],
    );

    const briefCard = startScreen?.cards.find((c) => c.skill === 'document-brief');
    const indexed = (documents ?? []).filter((d) => d.indexing_status === 'complete');
    // Same as the web UI's first-task pick: the prompt goes out at once, or waits in the box when it needs a subject.
    const askAboutDocuments = () => {
        if (!briefCard) return;
        holdDocuments(indexed.map((d) => d.id));
        if (briefCard.needs_input || send(briefCard.prompt) === false) setText(briefCard.prompt);
    };
    const briefShown = !!briefCard && indexed.length > 0 && !state.sending;
    const failedSetup = setupError(status);
    const warming = warmUpProgress(status?.warm_up);
    const [greeting, gloss] = bracketParts(t(greetingKey(new Date())));

    // Dots dim behind the greeting and composer, as on the desktop; padding matches its 40 and 24 px.
    const gridRef = useRef<DotGridHandle>(null);
    const greetingRef = useRef<DotGridHandle>(null);
    const composerRef = useRef<DotGridHandle>(null);
    const [dim, setDim] = useState<{ greeting: DimRect | null; composer: DimRect | null }>({ greeting: null, composer: null });
    const sending = state.sending;
    const measureDim = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        grid.measureInWindow((gx: number, gy: number) => {
            const read = (view: DotGridHandle | null, pad: number, set: (r: DimRect | null) => void) => {
                if (!view) return set(null);
                view.measureInWindow((x: number, y: number, width: number, height: number) => {
                    if (!width) return set(null);
                    set({ x: Math.round(x - gx - pad), y: Math.round(y - gy), width: Math.round(width + pad * 2), height: Math.round(height) });
                });
            };
            const keep = (key: 'greeting' | 'composer') => (r: DimRect | null) =>
                setDim((d) => {
                    const o = d[key];
                    const same = o === r || (o && r && o.x === r.x && o.y === r.y && o.width === r.width && o.height === r.height);
                    return same ? d : { ...d, [key]: r };
                });
            read(sending ? null : greetingRef.current, 40, keep('greeting'));
            read(composerRef.current, 24, keep('composer'));
        });
    }, [sending]);
    useEffect(measureDim, [measureDim]);
    // The card is the way out of a dead end: keep it, buttons and all, above the composer as it appears or grows.
    const dimBehind = [dim.greeting, dim.composer].filter((r): r is DimRect => r !== null);

    return (
        <Screen
            keyboard="avoid"
            scroll
            scrollRef={scrollRef}
            footerBleed
            backdrop={<DotGrid ref={gridRef} dimBehind={dimBehind} onLayout={measureDim} />}
            header={<ScreenHeader />}
            footer={
                <View ref={composerRef} collapsable={false} onLayout={measureDim}>
                    {heldOpening !== null && (
                        <Stack paddingX="lg" testID="held-opening" accessibilityRole="list">
                            <Surface tone="secondary" radius="md" padding="sm" border>
                                <Stack gap="xs">
                                    <Row gap="sm" align="center">
                                        <Stack flex={1}>
                                            <Text role="ui" numberOfLines={2} dir="auto">
                                                {heldOpening}
                                            </Text>
                                        </Stack>
                                        <IconButton
                                            icon={X}
                                            size="sm"
                                            label={t('queue.removeAria', { text: heldOpening })}
                                            onPress={() => setHeld(null)}
                                            testID="held-opening-remove"
                                        />
                                    </Row>
                                    <Text role="caption" tone="secondary" accessibilityLabel={t('composer.heldLabel')}>
                                        {t('composer.heldUntilStarted')}
                                    </Text>
                                </Stack>
                            </Surface>
                        </Stack>
                    )}
                    <QueuedMessages items={queue.held} replying={false} onRemove={queue.remove} onRetry={queue.retry} />
                    <Composer
                        value={state.text}
                        inputRef={inputRef}
                        onChange={setText}
                        onSend={send}
                        disabledReason={startingReason(status, t) ?? undefined}
                        attachments={attachments}
                        leftControls={
                            <>
                                <PermissionChip mode={mode} onChange={setMode} />
                                <PrivateChip
                                    on={isPrivate}
                                    onChange={setPrivate}
                                    memoryEnabled={memory.isError ? null : (memory.data?.memory_enabled ?? null)}
                                    memoryUnreadable={memory.isError}
                                />
                            </>
                        }
                        rightControls={<ModelChip />}
                    />
                </View>
            }
        >
            <Stack gap="lg" paddingX="lg" paddingY="xl" flex={1} justify="center">
                {!state.sending && (
                    <View ref={greetingRef} collapsable={false} onLayout={measureDim}>
                        <Stack gap="xs">
                            <Text role="display" accessibilityRole="header">
                                {greeting}
                            </Text>
                            {gloss !== undefined && (
                                <Text role="caption" tone="secondary">
                                    {`\u200F${gloss}`}
                                </Text>
                            )}
                        </Stack>
                    </View>
                )}
                <FlagshipAgentBanner />
                <ModelRestoreNotice />
                {failedSetup !== null && (
                    <Notice
                        tone="danger"
                        title={t('newChat.setupFailed.title')}
                        message={t('newChat.setupFailed.hint')}
                        detail={failedSetup}
                    />
                )}
                {!state.sending && <FolderChip folder={startScreen?.working_folder} initialPicking={initialPicking} />}
                {documents && !state.sending && (
                    <LibraryDocuments
                        documents={documents}
                        attachedIds={attachedIds}
                        onAttach={holdDocuments}
                        onRemove={dropDocument}
                        onChoose={onChooseDocuments}
                    />
                )}
                {briefShown && briefCard && (
                    <DocumentBriefCard count={indexed.length} onPress={askAboutDocuments} />
                )}
                {warming !== null && showWarmUp(status) && (
                    <ProgressLine label={warmUpLine(warming, t, shortModelName)} />
                )}
                {routeNotice !== null && (
                    <Notice
                        tone="info"
                        message={t(routeNotice)}
                        action={{ label: t('banner.dismiss'), onPress: dismissRouteNotice }}
                    />
                )}
                {state.sending && state.opening !== null && (
                    <Stack self="end" maxWidth="85%" testID="opening-message">
                        <Surface tone="userMsg" radius="lg" padding="md">
                            <Text role="body" dir="auto">
                                {state.opening}
                            </Text>
                        </Surface>
                    </Stack>
                )}
                {state.error !== null && <Notice tone="danger" message={state.error} detail={state.errorDetail} />}
                {!state.sending && startingReason(status, t) === null && <TryChips cards={startScreen?.cards} leave={briefShown ? ['document-brief'] : undefined} pending={startQuery.isPending && !startSlow} onPick={fillExample} />}
                {agentProblem !== null && (
                    <View onLayout={showCard} testID="agent-recovery-slot">
                        <AgentRecovery problem={agentProblem} answeredAt={assistant.answeredAt} onRetry={assistant.retry} kept={keptForAgent} />
                    </View>
                )}
                {assistant.problem !== null && (
                    <Stack gap="sm">
                        <Notice
                            tone="warning"
                            message={t('newChat.assistantUnavailable')}
                            action={{ label: t('newChat.tryAgain'), onPress: assistant.retry }}
                        />
                        <Disclosure
                            title={t('newChat.details')}
                            headerTestID="new-chat-details"
                            open={detailsOpen}
                            onToggle={() => setDetailsOpen((v) => !v)}
                        >
                            <Text role="caption" tone="secondary" mono selectable>
                                {assistant.problem}
                            </Text>
                        </Disclosure>
                    </Stack>
                )}
            </Stack>
        </Screen>
    );
}
