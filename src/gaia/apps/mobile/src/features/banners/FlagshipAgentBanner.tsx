// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { useFlagshipAgent, type FlagshipInstallState } from '@/data';
import { technicalDetail, useT } from '@/i18n/useT';
import { isPcRefusal } from '@/features/settings/PcOnlyNotice';
import { Notice } from '@/ui';

/** Shown above a chat while the PC has no GAIA agent: says why chat can't start, and offers the install. */
export function FlagshipAgentBanner({ initialState }: { /** Dev gallery only. */ initialState?: FlagshipInstallState } = {}) {
    const t = useT();
    const { missing, noBuild, state, install } = useFlagshipAgent(initialState);
    const refused = useDeviceRefused('POST', ENDPOINTS.agentsInstall);
    if (!missing) return null;
    // The PC keeps the install to itself for this phone: say so rather than offer a button it would refuse.
    if (refused || (state.kind === 'failed' && isPcRefusal(state.error))) {
        return <Notice tone="warning" message={`${t('agentNotice.missing')} ${t('mobileApp.settings.pcOnly')}`} testID="flagship-notice" />;
    }
    if (noBuild) return <Notice tone="warning" message={t('agentNotice.noBuild')} testID="flagship-notice" />;
    if (state.kind === 'installing') {
        return (
            <Notice
                tone="warning"
                message={t('agentNotice.installing', { percent: Math.round(state.percent) })}
                testID="flagship-notice"
            />
        );
    }
    const failed = state.kind === 'failed';
    return (
        <Notice
            tone="warning"
            message={failed ? t('mobileApp.agentNotice.failed') : t('agentNotice.missing')}
            detail={failed ? technicalDetail(state.error) : undefined}
            action={{ label: failed ? t('agentNotice.retry') : t('agentNotice.install'), onPress: () => void install() }}
            testID="flagship-notice"
        />
    );
}
