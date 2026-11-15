// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { GaiaApiError } from '@/api/errors';
import { useLocalModelStatus, useRestartLocalModel } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { Button, Notice, Row, Stack, Text } from '@/ui';

/**
 * Under a turn that failed because the model server took no connection: start GAIA's own
 * server, or look again. Switching to GAIA's own server is PC-only, so it is not offered here.
 */
export function ModelServerDownNotice() {
    const t = useT();
    const status = useLocalModelStatus(true);
    const restart = useRestartLocalModel();
    const [asked, setAsked] = useState(false);

    const s = status.data;
    const starting = restart.isPending || !!s?.restarting;
    const ours = s?.owner === 'gaia';
    const down = !s || s.state === 'stopped';

    if (asked && s && !down && !starting) {
        return <Notice tone="success" message={t('serverDown.back')} testID="server-down-back" />;
    }
    const raw = restart.error
        ? restart.error instanceof GaiaApiError
            ? restart.error.detail
            : describeError(restart.error, t)
        : s?.restart_error;
    const stillDown = asked && !starting && !status.isFetching && down && !raw;
    return (
        <Stack gap="sm" testID="server-down-notice">
            <Notice tone="warning" title={t('serverDown.title')} message={t('serverDown.body')} />
            {s && !ours ? <Text role="label" tone="secondary">{t('serverDown.notOurs')}</Text> : null}
            {stillDown ? <Text role="label" tone="secondary">{t('serverDown.stillDown')}</Text> : null}
            {raw ? <Text role="label" tone="danger">{raw}</Text> : null}
            <Row gap="sm" wrap>
                {ours ? (
                    <Button
                        size="sm"
                        label={starting ? t('serverDown.starting') : t('serverDown.start')}
                        disabled={starting}
                        onPress={() => {
                            setAsked(true);
                            restart.mutate({ confirm: false });
                        }}
                        testID="server-down-start"
                    />
                ) : null}
                <Button
                    size="sm"
                    label={t('settings.key.checkAgain')}
                    disabled={starting}
                    onPress={() => {
                        setAsked(true);
                        void status.refetch();
                    }}
                    testID="server-down-check"
                />
            </Row>
        </Stack>
    );
}
