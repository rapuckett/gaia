// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { GaiaClientProvider, useSetupPlan, useSetupStatus } from '@/data';
import { useT } from '@/i18n/useT';
import { Screen, ScreenBannerProvider, Stack, UIProvider } from '@/ui';

import { setupSceneClient, type ConfirmScene, type SetupScene } from './devScenes';
import type { SetupStage } from './flow';
import { DownloadChip } from './DownloadChip';
import { useConfirmSheet } from './sheets/ConfirmSheet';
import { lowDiskRequest, noFitRequest, serverConfirmRequest, type ConfirmRequest } from './sheets/setupConfirm';
import { useQueuedModels } from './optionalModels';
import { SeedAgentCompare } from '@/features/settings/panes/model/AgentChoice';
import { AgentWait } from './steps/AgentWait';
import type { useAgentFirst } from './steps/useAgentFirst';
import { SetupFooterBar, SetupFooterProvider } from './SetupFooter';
import { SetupScreen, type SetupStepContext } from './SetupScreen';
import { SETUP_STEPS } from './steps';
import { SeedOffer } from './steps/CheckOffer';
import { usePlanScreenRequest } from './steps/planScreenRequest';
import { usePlanSelection } from './steps/planSelection';

const noop = () => undefined;

function SceneStep({ stage }: { stage: SetupStage }) {
    const run = useSetupStatus().data ?? null;
    const plan = useSetupPlan().data;
    const Step = SETUP_STEPS[stage];
    if (!Step) throw new Error(`Setup has no body registered for the ${stage} step.`);
    const ctx: SetupStepContext = { stage, run, plan, locked: false, again: false, goTo: noop, startedRun: noop, finish: noop };
    return <Step ctx={ctx} />;
}

/** The agent wait on a fixture, since the real one needs a held run. */
function SceneAgentWait({ kind }: { kind: 'failed' | 'interrupted' }) {
    const agent: ReturnType<typeof useAgentFirst> = {
        pick: { id: 'gaiacpp', download: true, current: 'gaiapy' },
        setPick: noop,
        held: true,
        job: { state: 'failed', bytes_done: 4_200_000, bytes_total: 9_400_000, error: kind === 'failed' ? 'gaiacpp-0.4.1-macos-arm64.tar.gz: checksum does not match the release manifest' : null },
        interrupted: kind === 'interrupted',
        failure: null,
        error: null,
        saving: false,
        begin: () => Promise.resolve(),
        carryOn: noop,
        cancel: noop,
        retry: noop,
        retryDownload: () => Promise.resolve(),
    };
    return <AgentWait agent={agent} />;
}

/** Each confirm sheet worded by the same builders the steps ask with. */
function confirmRequest(kind: ConfirmScene, t: ReturnType<typeof useT>): ConfirmRequest {
    switch (kind) {
        case 'low-disk':
            return lowDiskRequest({ needGb: 30.4, freeGb: 2.1, freeUpGb: 28.3 }, t);
        case 'no-fit-one':
            return noFitRequest([{ name: 'Qwen3.6 35B A3B (Multimodal)', why: 'needs 26.8 GB and this PC has 16 GB for models' }], t);
        case 'no-fit-tight':
            return noFitRequest([{ name: 'Qwen3.6 35B A3B (Multimodal)', why: t('setup.models.warn.tight'), tight: true }], t);
        case 'no-fit-many':
            return noFitRequest(
                [
                    { name: 'Qwen3.6 35B A3B (Multimodal)', why: 'needs 26.8 GB and this PC has 16 GB for models' },
                    { name: 'Gemma 4 E4B (NPU)', why: 'needs an AMD Ryzen AI NPU and its driver' },
                ],
                t,
            );
        case 'server-low-disk':
            return serverConfirmRequest({ code: 'low_disk', acknowledge: 'acknowledge_low_disk', message: 'Not enough free disk space: the models need 30.4 GB and 2.1 GB is free.' }, t);
        case 'server-no-fit':
            return serverConfirmRequest({ code: 'no_fit', acknowledge: 'acknowledge_no_fit', message: 'Qwen3.6 35B A3B needs 26.8 GB and this PC has 16 GB for models.' }, t);
    }
}

function ConfirmOpen({ kind }: { kind: ConfirmScene }) {
    const t = useT();
    const { ask, sheet } = useConfirmSheet();
    useEffect(() => {
        void ask(confirmRequest(kind, t));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once, on arrival
    }, []);
    return <>{sheet}</>;
}

/** One setup scene on a fake PC: a step body, or the whole setup screen, with a sheet or the chip when the scene has one. */
export function SetupSceneView({ found }: { found: SetupScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        // The plan step opens this screen on arrival, as it does when another step asks for it.
        useQueuedModels.setState({ ids: found.queued ?? [] });
        // The selection store is global; a scene seeds its own from its plan.
        usePlanSelection.getState().setSelection(null);
        if (found.screen) usePlanScreenRequest.getState().request({ screen: found.screen, from: 'check' });
        return setupSceneClient(found);
    });
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        {found.shell ? (
                            <SetupScreen onReady={noop} onClose={found.shell.again ? noop : undefined} initialViewing={found.shell.viewing} />
                        ) : (
                            <SetupFooterProvider>
                                <Screen width="flow" scroll footer={<SetupFooterBar />}>
                                    <Stack gap="lg" padding="lg">
                                        {found.chip ? <DownloadChip onPress={noop} /> : null}
                                        <SeedOffer.Provider value={found.offer ?? null}>
                                            <SeedAgentCompare.Provider value={!!found.agentCompareOpen}>
                                                {found.agentWait ? <SceneAgentWait kind={found.agentWait} /> : <SceneStep stage={found.stage} />}
                                            </SeedAgentCompare.Provider>
                                        </SeedOffer.Provider>
                                        {found.confirm ? <ConfirmOpen kind={found.confirm} /> : null}
                                    </Stack>
                                </Screen>
                            </SetupFooterProvider>
                        )}
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
