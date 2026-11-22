// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { GaiaApiError } from '@/api/errors';
import { useLemonadeTarget, useLocalModelStatus, useRestartLocalModel, useSetLemonadeTarget, useSystemStatus } from '@/data';
import { describeError, describeHttpFailure, useT } from '@/i18n/useT';
import { ChipButton } from '@/features/schedules/ChipButton';
import { needsLocalSetup } from '@/features/settings/panes/advanced/statusText';
import { isPcRefusal } from '@/features/settings/PcOnlyNotice';
import { useAnnounce } from '@/platform/useAnnounce';
import { Icon, Notice, Row, Text, useTheme } from '@/ui';
import { TriangleAlert } from '@/ui/icons';
import { View } from 'react-native';

import { serverDownOffer } from './serverDownOffer';

/**
 * Under a turn that failed because the model server took no connection: start GAIA's own
 * server, switch the PC back to it when it points at another one, or look again. What is
 * offered follows the PC's notice (`serverDownOffer`).
 */
export function ModelServerDownNotice({
    initialAsked = false,
    initialSwitched = false,
    autoSwitch = false,
}: {
    /** Dev gallery only: opens after "Check again" was pressed. */
    initialAsked?: boolean;
    /** Dev gallery only: opens after a successful switch. */
    initialSwitched?: boolean;
    /** Dev gallery only: presses "Use GAIA's own server" on mount. */
    autoSwitch?: boolean;
} = {}) {
    const t = useT();
    const status = useLocalModelStatus(true);
    const target = useLemonadeTarget();
    const system = useSystemStatus();
    const restart = useRestartLocalModel();
    const switchOwn = useSetLemonadeTarget();
    const { colors, radius, space } = useTheme();
    const [asked, setAsked] = useState(initialAsked);
    const [switched, setSwitched] = useState(initialSwitched);

    const s = status.data;
    const switching = switchOwn.isPending;
    const starting = restart.isPending || !!s?.restarting;
    const busy = starting || switching;
    const targetRead = target.isError ? 'failed' : target.data ? 'read' : 'loading';
    const { start, useOwn, notOurs } = serverDownOffer(s, target.data, targetRead);
    const down = !s || s.state === 'stopped';

    const switchToOwn = () => {
        switchOwn.mutate(
            { mode: 'gaia' },
            {
                onSuccess: () => {
                    setSwitched(true);
                    void status.refetch();
                },
            },
        );
    };
    useEffect(() => {
        if (autoSwitch) switchToOwn();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
    }, []);
    // GAIA's own server may not be set up yet: the ambient setup banner carries that, so no "back" here.
    const setupNeeded = !!system.data && needsLocalSetup(system.data);
    const backNow = (switched || (asked && !busy)) && !!s && !down && !setupNeeded;
    useAnnounce(backNow && switched ? t('serverDown.back') : null);

    if (switched && setupNeeded) return null;
    if (backNow) {
        return <Notice tone="success" message={t('serverDown.back')} testID="server-down-back" />;
    }
    const raw = restart.error
        ? restart.error instanceof GaiaApiError
            ? restart.error.detail
            : describeError(restart.error, t)
        : s?.restart_error;
    const switchError = switchOwn.error && !isPcRefusal(switchOwn.error) ? describeHttpFailure(switchOwn.error, t) : null;
    const targetFailure = target.isError ? describeHttpFailure(target.error, t) : null;
    const stillDown = asked && !busy && !status.isFetching && down && !raw;
    return (
        <View
            testID="server-down-notice"
            accessibilityRole="alert"
            style={{
                gap: space.sm,
                padding: space.md,
                backgroundColor: colors.bgCard,
                borderColor: colors.accentYellow,
                borderWidth: 1,
                borderRadius: radius.md,
            }}
        >
            <Row gap="sm">
                <Icon icon={TriangleAlert} size="sm" tone="warning" />
                <Text role="ui" weight="semibold">{t('mobileApp.serverDown.title')}</Text>
            </Row>
            <Text role="ui">{t('serverDown.body')}</Text>
            {notOurs ? <Text role="ui">{t('mobileApp.serverDown.notOurs')}</Text> : null}
            {targetFailure ? <Notice tone="danger" message={targetFailure.text} detail={targetFailure.detail} testID="server-down-target-failed" /> : null}
            {stillDown ? <Text role="ui">{t('serverDown.stillDown')}</Text> : null}
            {raw ? <Text role="label" tone="secondary" mono dir="ltr">{raw}</Text> : null}
            {switchOwn.error && isPcRefusal(switchOwn.error) ? <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="server-down-pc-only" /> : null}
            {switchError ? <Notice tone="danger" message={switchError.text} detail={switchError.detail} testID="server-down-switch-error" /> : null}
            <Row gap="xs" wrap>
                {start ? (
                    <ChipButton
                        variant="primary"
                        label={starting ? t('serverDown.starting') : t('serverDown.start')}
                        disabled={busy}
                        testID="server-down-start"
                        onPress={() => {
                            setAsked(true);
                            restart.mutate({ confirm: false });
                        }}
                    />
                ) : null}
                {useOwn ? (
                    <ChipButton
                        variant="primary"
                        label={switching ? t('serverDown.switching') : t('serverDown.useOwn')}
                        disabled={busy}
                        testID="server-down-use-own"
                        onPress={switchToOwn}
                    />
                ) : null}
                <ChipButton
                    variant="plain"
                    label={t('settings.key.checkAgain')}
                    disabled={busy}
                    testID="server-down-check"
                    onPress={() => {
                        setAsked(true);
                        void status.refetch();
                        void target.refetch();
                    }}
                />
            </Row>
        </View>
    );
}
