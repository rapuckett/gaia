// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { SystemStatus } from '@/api/client.types';
import { isStarting } from '@/data';
import { namesSetupCommand, needsLocalSetup } from '@/features/settings/panes/advanced/statusText';
import { technicalDetail, type Translate } from '@/i18n/useT';
import type { NoticeTone } from '@/ui';
import { isolate } from '@webui/i18n/registry';
import { GB_UNIT, MIN_CONTEXT_SIZE } from '@webui/utils/constants';
import { shortModelName, type PickLoad } from '@webui/utils/modelList.core';

export interface Banner {
    id: 'download' | 'goalStore' | 'starting' | 'unreachable' | 'backendError' | 'slow' | 'configError' | 'serverHung' | 'serverStopped' | 'contextTooSmall' | 'pickLoad';
    tone: NoticeTone;
    title: string;
    message?: string;
    /** Raw server text (a filename), kept out of the translated message; shown on its own LTR line. */
    detail?: string;
    /** The raw cause, for a Details disclosure; never part of the sentence. */
    details?: string;
    /** How the PC starts its model server, as it sent it: a command or its own instruction, on a line of its own. */
    command?: string;
    /** The web lets these go: a failed download, a stopped or hung model server, a too-small context window. */
    dismissible?: boolean;
    /** Setup isn't done on this PC: the card offers "Open setup" beside "Check again". */
    setup?: boolean;
    /** Re-asks GAIA; shown as the "Check again" action. */
    retry?: boolean;
    /** The model whose failed download the "Retry" action starts again. */
    downloadRetry?: string;
    /** Asks the PC to load the picked model again; shown as the "Try again" action. */
    pickRetry?: boolean;
    /** 0 to 1 for a determinate line; undefined for an indeterminate one. */
    progress?: { value?: number; label?: string };
}

/** The banners that say the model server isn't answering; each replaces the setup gate's generic "can't reply yet" notice. */
export const isServerDownBanner = (banner: Banner | null | undefined): boolean => banner?.id === 'serverStopped' || banner?.id === 'serverHung';

/** Keeps "12s" reading left to right inside Arabic text. */
const ltr = (text: string) => `\u2066${text}\u2069`;

const gb = (bytes: number, digits: number) => (bytes / 1e9).toFixed(digits);

const UNREACHABLE = (t: Translate): Banner => ({ id: 'unreachable', tone: 'danger', title: t('banner.unreachable'), message: t('banner.unreachableHint'), retry: true });

/**
 * The one banner the app shows, in the web's ConnectionBanner order (NTF-08..13):
 * download, start-up, backend trouble, model server, context window.
 * The web's slow banner is a status request that outlasts its timeout or a gateway's 504; `pick.slow` is
 * the phone's streak of those (`useStatusHealth`).
 * `fetchError` is the status request's failure, if it failed.
 */
export function pickBanner(
    status: SystemStatus | undefined,
    fetchError: unknown,
    t: Translate,
    goalStoreError?: string | null,
    pick?: { load?: PickLoad | null; name?: string | null; awayHint?: boolean; slow?: boolean; slowPending?: boolean; lost?: boolean; modelNames?: Record<string, string> },
): Banner | null {
    // An unreachable PC's last status is stale; the web drops it too (App.tsx applyStatus).
    if (fetchError && !pick?.slowPending && (pick?.lost || fetchError instanceof GaiaNetworkError)) status = undefined;
    const progress = status?.download_progress ?? null;
    if (progress?.state === 'downloading' || progress?.state === 'starting' || progress?.state === 'error') {
        const name = progress.model_name || status?.default_model_name || '';
        if (progress.state === 'error') {
            const label = pick?.modelNames?.[name] ?? shortModelName(name);
            return { id: 'download', tone: 'danger', title: t('mobileApp.model.downloadFailedShort', { model: isolate(label, 'ltr') }), detail: progress.message ? isolate(progress.message, 'ltr') : undefined, dismissible: true, downloadRetry: name };
        }
        const knownSize = progress.total_bytes ? `${gb(progress.total_bytes, 1)} ${GB_UNIT}` : null;
        const file = progress.file ? t('banner.download.file', { index: progress.file_index, total: progress.total_files }) : undefined;
        const bar =
            progress.state === 'downloading' && progress.total_bytes > 0
                ? { value: progress.percent / 100, label: `${progress.percent}% · ${gb(progress.downloaded_bytes, 2)} / ${gb(progress.total_bytes, 2)} ${GB_UNIT}` }
                : { label: progress.state === 'starting' ? (progress.message ?? t('update.picker.starting')) : t('banner.download.progress') };
        return { id: 'download', tone: 'info', title: t.compose((say) => say('banner.download.running', { name, size: knownSize ?? say('banner.download.sizeUnknown') })), message: file, detail: progress.file ? isolate(progress.file, 'ltr') : undefined, progress: bar };
    }

    // A model picked from the list is loading, or its load failed; the web shows it right after a download.
    if (pick?.load) {
        const { model, seconds, error } = pick.load;
        const name = pick.name || shortModelName(model);
        if (error) {
            return {
                id: 'pickLoad',
                tone: 'danger',
                title: t('banner.pickLoad.failed', { model: name }),
                message: error.key ? t(error.key, { reason: error.reason }) : error.reason,
                dismissible: true,
                pickRetry: true,
            };
        }
        return {
            id: 'pickLoad',
            tone: 'info',
            title: `${t('banner.pickLoad.loading', { model: name })} ${ltr(t('banner.pickLoad.seconds', { s: seconds }))}`,
            message: t('banner.pickLoad.canType'),
            progress: {},
        };
    }

    // A slow answer below the streak shows nothing, as on the web; its timeout is no outage.
    if (fetchError && !pick?.slowPending) {
        if (pick?.lost) return UNREACHABLE(t);
        if (pick?.slow || (fetchError instanceof GaiaApiError && fetchError.status === 504)) {
            return { id: 'slow', tone: 'warning', title: t('banner.slow'), message: t('banner.slowHint'), retry: true };
        }
        if (fetchError instanceof GaiaApiError && fetchError.status >= 500) {
            return {
                id: 'backendError',
                tone: 'danger',
                title: t('mobileApp.error.backend', { status: fetchError.status }),
                message: t('banner.backendErrorHint'),
                details: technicalDetail(fetchError),
                retry: true,
            };
        }
        // The PC itself not answering reads as the setup gate does; the assistant wording is for a PC that answers.
        if (fetchError instanceof GaiaNetworkError) {
            return { id: 'unreachable', tone: 'danger', title: t('mobileApp.pairing.off.title'), message: t(pick?.awayHint ? 'mobileApp.pairing.unreachable.away' : 'mobileApp.pairing.unreachable.body'), retry: true };
        }
        return UNREACHABLE(t);
    }
    if (!status) return null;

    if (isStarting(status)) {
        const running = status.init_tasks?.find((task) => task.status === 'running');
        return { id: 'starting', tone: 'info', title: running?.name || t('banner.preparing'), progress: {} };
    }

    if (status.config_error) {
        return { id: 'configError', tone: 'warning', title: t('banner.configError'), message: status.config_error };
    }

    if (!status.lemonade_running) {
        // Listening but failing its health check is usually busy, not stopped.
        const hung = Boolean(status.lemonade_error);
        // A server that listens is installed: setup can't fix a hang, so it isn't offered.
        const setupNeeded = !hung && needsLocalSetup(status);
        const command = hung && namesSetupCommand(status.start_command) ? null : status.start_command;
        const instruction = hung && namesSetupCommand(status.start_instruction) ? null : status.start_instruction;
        // GAIA starts its own server by itself, so then the PC sends no way to start it and the title stands alone.
        const hint = setupNeeded
            ? { message: t('banner.finishSetup') }
            : command
              ? { message: t(hung ? 'banner.restartHint' : 'banner.startHint'), command }
              : instruction
                ? { command: instruction }
                : {};
        return {
            id: hung ? 'serverHung' : 'serverStopped',
            tone: 'warning',
            title: t(hung ? 'banner.serverHung' : 'banner.serverStopped'),
            ...hint,
            ...(setupNeeded ? { setup: true } : {}),
            retry: true,
            dismissible: true,
        };
    }

    const size = status.model_context_size;
    if (!status.context_size_sufficient && size) {
        return {
            id: 'contextTooSmall',
            tone: 'warning',
            title: t('banner.contextTooSmall', { current: size.toLocaleString(), required: MIN_CONTEXT_SIZE.toLocaleString() }),
            message: t('banner.contextTooSmallHint'),
            retry: true,
            dismissible: true,
        };
    }
    if (goalStoreError) {
        return { id: 'goalStore', tone: 'warning', title: t('mem.goals.storeError'), message: goalStoreError, dismissible: true };
    }
    return null;
}
