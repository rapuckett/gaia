// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import type { DocumentResponse, IndexFolderResponse } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { useAddDocument, useAddPcPath, useSetupPreflight } from '@/data';
import { describeError, describeErrorWith, useT } from '@/i18n/useT';
import { pickDocuments, pickPhotos, type PickedFile } from '@/platform/pickers';
import { Button, Notice, ProgressLine, Row, Stack, Text, TextField } from '@/ui';
import { FileText, FolderOpen, Image as ImageIcon } from '@/ui/icons';
import { isolate, type MessageKey, type Params } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';
import { describeFolderResult } from '@webui/utils/documentLibrary.core';
import { cleanPastedPath } from '@webui/utils/pastedPath';
import { examplePath } from '@webui/utils/platform';
import { describeUploadError, unsupportedTypeMessage, type UploadErrorInput, type UploadErrorView } from '@webui/utils/uploadErrors.core';

import { fileRefusalText, isFileRefusal, isKnownRefusalCode } from '../files/fileRefusal';
import { useNextChatDocs } from './nextChatDocs';
import { phonePathExample } from './phonePathExample';

// One line at a time: the indexing status, the result of the last add, or why it failed.
export type AddLine =
    | { kind: 'busy'; name: string; folder?: boolean }
    | { kind: 'done'; message: string }
    | { kind: 'folder'; message: string; added: boolean; detail?: string }
    | { kind: 'unreadable'; message: string }
    | { kind: 'failed'; error: UploadErrorView }
    | { kind: 'refused'; message: string; title?: string; detail?: string }
    | { kind: 'picker'; message: string }
    | { kind: 'unsupported'; message: string };

/** A catalog message the screen translates itself. */
export interface StartMessage {
    key: MessageKey;
    params?: Params;
}

/** Dev gallery only: the line a scene opens with, in what production stores before it is translated. */
export type AddStart =
    | { kind: 'busy'; name: string; folder?: boolean }
    | { kind: 'done' | 'unreadable'; message: StartMessage }
    | { kind: 'folder'; name: string; result: IndexFolderResponse }
    | { kind: 'failed'; upload: Omit<UploadErrorInput, 'error'> & { error: string | StartMessage } }
    | { kind: 'refused' | 'picker' | 'unsupported'; cause: unknown };

function resolveStart(t: Translate, start: AddStart): AddLine {
    switch (start.kind) {
        case 'busy':
            return start;
        case 'folder':
            return folderLine(t, start.name, start.result);
        case 'done':
        case 'unreadable':
            return { kind: start.kind, message: t(start.message.key, start.message.params) };
        case 'failed': {
            const { error, ...rest } = start.upload;
            return { kind: 'failed', error: describeUploadError(t, { ...rest, error: typeof error === 'string' ? error : t(error.key, error.params) }) };
        }
        case 'refused':
            return isFileRefusal(start.cause) ? refusedLine(t, start.cause) : { kind: 'refused', message: describeError(start.cause, t) };
        default:
            return { kind: start.kind, message: describeError(start.cause, t) };
    }
}

// The PC's English reason for the first unreadable file goes in `detail`, never inside the translated sentence.
function folderLine(t: Translate, name: string, result: IndexFolderResponse): AddLine {
    const reason = result.failed > 0 ? result.errors[0]?.split('\n')[0] : undefined;
    return { kind: 'folder', message: describeFolderResult(t, isolate(name, 'ltr'), { ...result, errors: [] }), added: result.indexed > 0, detail: reason };
}

// A code this app words is fully translated; the PC's sentence for any other code is shown as a detail line.
function refusedLine(t: Translate, error: GaiaApiError): AddLine {
    if (isKnownRefusalCode(error)) return { kind: 'refused', title: t('docs.locationRefused'), message: fileRefusalText(error, t) };
    return { kind: 'refused', message: t('docs.locationRefused'), detail: error.detail };
}

/** The last part of a typed path, for messages; the path itself is sent as typed. */
function pathName(path: string): string {
    return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
}

interface AddDocumentsProps {
    // The chat documents are attached to; null leaves them for the next new chat.
    chatId: string | null;
    chatName: string | null;
    // Called when an add starts, so the screen can clear its own library line.
    onStart?: () => void;
    // Opens the PC's file browser for the chat; unset, or with no chat, leaves the button out.
    onBrowse?: (chatId: string) => void;
    // The open chat, whose folders the PC reads a typed path from; unset leaves the path box out.
    pcChatId?: string | null;
    // Dev gallery only: the line shown on open, and the text in the path box.
    initialLine?: AddStart;
    initialPath?: string;
}

export function AddDocuments({ chatId, chatName, onStart, onBrowse, pcChatId, initialLine, initialPath }: AddDocumentsProps) {
    const t = useT();
    const add = useAddDocument();
    const addPath = useAddPcPath();
    const preflight = useSetupPreflight();
    const holdForNextChat = useNextChatDocs((s) => s.add);
    const [line, setLine] = useState<AddLine | null>(() => (initialLine ? resolveStart(t, initialLine) : null));
    const [path, setPath] = useState(initialPath ?? '');
    const busy = line?.kind === 'busy';
    const pcOs = preflight.data?.os;
    // The example follows the PC's way of writing paths; darwin is a Mac too.
    const pathExample = pcOs == null ? undefined : phonePathExample(examplePath(/darwin/i.test(pcOs) ? 'Mac' : pcOs));

    function attachFailed(filename: string, attachError: Error): AddLine {
        const error = t.compose((say) => say('docs.attachFailedAfterIndex', { chat: chatName ?? '', error: describeErrorWith(attachError, say) }));
        return { kind: 'failed', error: describeUploadError(t, { filename, error }) };
    }

    function indexedLine(document: DocumentResponse, filename: string, attachError: Error | null): AddLine {
        const name = isolate(document.filename || filename, 'ltr');
        if (document.indexing_status === 'failed') return { kind: 'unreadable', message: t('docs.notAdded', { name }) };
        if (attachError) return attachFailed(filename, attachError);
        if (!chatId) holdForNextChat([document.id]);
        return { kind: 'done', message: chatId ? t('docs.attached', { name, chat: chatName ?? '' }) : t('docs.willAttach', { name }) };
    }

    // The PC's answer as it sent it, through the same formatting as a picked file's.
    function failedLine(err: unknown, filename: string): AddLine {
        // An app build without uploads can't send a file to a paired PC; the request wraps its error, so look at the cause too.
        const refusal = [err, err instanceof Error ? err.cause : null].find((e) => (e as { code?: string } | null)?.code === 'unsupported_body');
        if (refusal) return { kind: 'unsupported', message: describeError(refusal, t) };
        if (isFileRefusal(err)) return refusedLine(t, err);
        const api = err instanceof GaiaApiError ? err : null;
        const kind = typeof api?.body?.status === 'string' ? api.body.status : null;
        const error = kind === 'too_large' ? t('docs.tooLargeDetail', { max: String(api?.body?.max_mb) }) : describeError(err, t);
        return { kind: 'failed', error: describeUploadError(t, { filename, error, status: api?.status, kind }) };
    }

    async function addOne(file: PickedFile): Promise<AddLine> {
        const unsupported = unsupportedTypeMessage(file.name);
        if (unsupported) return { kind: 'failed', error: describeUploadError(t, { filename: file.name, error: unsupported }) };
        setLine({ kind: 'busy', name: file.name });
        try {
            const { document, attachError } = await add.mutateAsync({ file, chatId });
            return indexedLine(document, file.name, attachError);
        } catch (err) {
            return failedLine(err, file.name);
        }
    }

    // Only the person's Add sends the path; the PC decides whether this chat may read it.
    async function submitPath() {
        const typed = path.trim();
        if (!typed || busy || !pcChatId) return;
        onStart?.();
        const name = pathName(cleanPastedPath(typed));
        setLine({ kind: 'busy', name });
        let next: AddLine;
        let added = false;
        try {
            const out = await addPath.mutateAsync({ path: typed, readChatId: pcChatId, chatId, onFolder: () => setLine({ kind: 'busy', name, folder: true }) });
            if (out.kind === 'folder') {
                const ids = out.result.documents.map((d) => d.id);
                if (!chatId && ids.length > 0) holdForNextChat(ids);
                next = out.attachError ? attachFailed(name, out.attachError) : folderLine(t, name, out.result);
                added = true;
            } else {
                next = indexedLine(out.document, name, out.attachError);
                added = out.document.indexing_status !== 'failed';
            }
        } catch (err) {
            next = failedLine(err, name);
        }
        setLine(next);
        // A failed add keeps the typed path, so trying again is one tap.
        if (added) setPath('');
    }

    async function run(pick: () => Promise<PickedFile[]>) {
        let files: PickedFile[];
        try {
            files = await pick();
        } catch (err) {
            setLine({ kind: 'picker', message: describeError(err, t) });
            return;
        }
        if (files.length === 0) return;
        onStart?.();
        let result: AddLine | null = null;
        for (const file of files) {
            const next = await addOne(file);
            // The first failure stays on screen; later successes don't hide it.
            if (!result || result.kind === 'done') result = next;
        }
        setLine(result);
    }

    return (
        <Stack gap="sm">
            <Row gap="sm" wrap stack>
                <Button label={t('docs.addPhotos')} icon={ImageIcon} variant="secondary" disabled={busy} onPress={() => void run(pickPhotos)} />
                <Button label={t('docs.addFile')} icon={FileText} variant="secondary" disabled={busy} onPress={() => void run(pickDocuments)} />
            </Row>
            {onBrowse && chatId ? <Button label={t('chat.browseFiles')} icon={FolderOpen} variant="secondary" full disabled={busy} onPress={() => onBrowse(chatId)} /> : null}
            {pcChatId ? (
                <Stack gap="xs">
                    <Text role="caption" tone="secondary">
                        {t('docs.pathHint')}
                    </Text>
                    <Row gap="sm" align="center">
                        <Stack flex={1}>
                            <TextField
                                value={path}
                                onChangeText={setPath}
                                placeholder={pathExample}
                                accessibilityLabel={t('docs.pathAria')}
                                url
                                returnKeyType="go"
                                onSubmitEditing={() => void submitPath()}
                                testID="docs-path"
                            />
                        </Stack>
                        <Button label={t('docs.index')} variant="secondary" disabled={!path.trim() || busy} onPress={() => void submitPath()} />
                    </Row>
                    <Text role="caption" tone="secondary">
                        {t('docs.pathSubfolders')}
                    </Text>
                </Stack>
            ) : null}
            {line?.kind === 'busy' ? (
                <Stack gap="xs">
                    <Text role="caption" tone="secondary">
                        {line.folder ? t('docs.indexingFolder', { name: isolate(line.name, 'ltr') }) : t('docs.indexingFile', { name: isolate(line.name, 'ltr') })}
                    </Text>
                    <ProgressLine />
                </Stack>
            ) : null}
            {line?.kind === 'done' ? <Notice tone="success" role="note" message={line.message} onDismiss={() => setLine(null)} /> : null}
            {line?.kind === 'folder' ? (
                <Notice tone={line.added ? 'success' : 'info'} role="status" message={line.message} detail={line.detail} onDismiss={() => setLine(null)} dismissLabel={t('docs.dismissFolder')} />
            ) : null}
            {line?.kind === 'unsupported' ? <Notice tone="warning" message={line.message} onDismiss={() => setLine(null)} /> : null}
            {line?.kind === 'unreadable' || line?.kind === 'picker' ? (
                <Notice tone="danger" message={line.message} onDismiss={() => setLine(null)} />
            ) : null}
            {line?.kind === 'refused' ? <Notice tone="warning" title={line.title} message={line.message} detail={line.detail} onDismiss={() => setLine(null)} /> : null}
            {line?.kind === 'failed' ? (
                <Notice
                    tone={line.error.icon === 'warning' ? 'warning' : 'danger'}
                    title={line.error.title}
                    message={line.error.detail}
                    onDismiss={() => setLine(null)}
                />
            ) : null}
        </Stack>
    );
}
