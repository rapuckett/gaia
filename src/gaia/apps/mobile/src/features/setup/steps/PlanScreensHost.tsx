// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';

import type { SetupStepContext } from '../SetupScreen';
import { lowDiskRequest } from '../sheets/setupConfirm';
import { useConfirmSheet } from '../sheets/ConfirmSheet';
import { PlanOpenersContext, type PlanOpeners } from './planOpeners';
import { PLAN_SCREENS, type PlanScreenName } from './planScreens';
import { PlanStep } from './PlanStep';

/** The plan step and the screens it opens. The plan stays mounted under them, so its choices survive a visit. */
export function PlanWithScreens({ ctx }: { ctx: SetupStepContext }) {
    const t = useT();
    const [stack, setStack] = useState<PlanScreenName[]>([]);
    const { ask, sheet } = useConfirmSheet();

    const openers = useMemo<PlanOpeners>(() => {
        const opener = (name: PlanScreenName) =>
            PLAN_SCREENS[name] ? () => setStack((s) => (s[s.length - 1] === name ? s : [...s, name])) : undefined;
        return {
            openModels: opener('models'),
            openKey: opener('key'),
            openGpu: opener('gpu'),
            confirmLowDisk: (short, proceed) => {
                void ask(lowDiskRequest(short, t)).then((ok) => {
                    if (ok) proceed(true);
                });
            },
        };
    }, [ask, t]);

    const top: PlanScreenName | undefined = stack[stack.length - 1];
    const Screen = top ? PLAN_SCREENS[top] : undefined;
    const close = () => setStack((s) => s.slice(0, -1));

    return (
        <PlanOpenersContext.Provider value={openers}>
            <View style={Screen ? { display: 'none' } : undefined}>
                <PlanStep ctx={ctx} />
            </View>
            {Screen ? <Screen key={top} ctx={ctx} close={close} /> : null}
            {sheet}
        </PlanOpenersContext.Provider>
    );
}
