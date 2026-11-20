// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { router } from 'expo-router';
import { createContext, useContext, useState } from 'react';
import { isolate } from '@webui/i18n/registry';

import type { LemonadeTarget as Target } from '@/api/client.types';
import { ENDPOINTS } from '@/api/constants';
import { GaiaApiError } from '@/api/errors';
import { useDeviceRefused } from '@/api/routeAccess';
import { useLemonadeTarget, useSetLemonadeTarget, useSwitchToYourServer } from '@/data';
import { reopenSetup } from '@/features/setup/SetupGate';
import { technicalDetail, useT } from '@/i18n/useT';
import { Button, Notice, Spinner, Stack, Text, TextField } from '@/ui';

import { PcOnlyNotice } from '../../PcOnlyNotice';
import { ActionError, RawDetails, SwitchError } from './errors';
import { OwnServerConfirm } from './OwnServerConfirm';

/** Dev gallery only: the form opens with these typed, and the confirm sheet up when `confirming`. */
export interface OwnServerSeed {
    url: string;
    key?: string;
    confirming?: boolean;
}

export const SeedOwnServer = createContext<OwnServerSeed | null>(null);

/**
 * "Use my own server": the address and an optional key, then a confirm sheet whose button is the only press that
 * sends the switch. The key lives in this form until it is sent, and is cleared whether the switch worked or not.
 */
function OwnServerForm({ target }: { target: Target }) {
    const t = useT();
    const seed = useContext(SeedOwnServer);
    const sendSwitch = useSwitchToYourServer();
    const [url, setUrl] = useState(seed?.url ?? target.saved_base_url ?? target.base_url ?? '');
    const [key, setKey] = useState(seed?.key ?? '');
    const [confirming, setConfirming] = useState(!!seed?.confirming);
    const [error, setError] = useState<unknown>(null);
    const busy = sendSwitch.isPending;
    const keyPlaceholder = target.api_key_stored ? 'settings.server.keySaved' : 'settings.server.keyOptional';

    const confirm = () => {
        setConfirming(false);
        const typedKey = key;
        setKey('');
        setError(null);
        sendSwitch.send(url, typedKey).catch((err: unknown) => setError(err));
    };

    return (
        <Stack gap="sm">
            <TextField
                value={url}
                onChangeText={(v) => {
                    setUrl(v);
                    setError(null);
                }}
                label={t('settings.server.address')}
                literal
                url
                disabled={busy}
                testID="own-server-url"
            />
            <TextField
                value={key}
                onChangeText={setKey}
                label={t('settings.server.key')}
                placeholder={t.bare(keyPlaceholder)}
                accessibilityHint={t(keyPlaceholder)}
                secret
                disabled={busy}
                testID="own-server-key"
            />
            <Button
                label={busy ? t('settings.server.checking') : t('settings.server.use')}
                variant="primary"
                full
                busy={busy}
                disabled={busy || !url.trim()}
                onPress={() => setConfirming(true)}
                testID="own-server-use"
            />
            {error ? <SwitchError error={error} /> : null}
            <OwnServerConfirm url={url} open={confirming} onClose={() => setConfirming(false)} onConfirm={confirm} />
        </Stack>
    );
}

/** Which model server GAIA uses: switch to your own (confirmed on a sheet), or back to GAIA's own. */
export function LemonadeTarget() {
    const t = useT();
    const query = useLemonadeTarget();
    const save = useSetLemonadeTarget();
    const saveRefused = useDeviceRefused('POST', ENDPOINTS.lemonadeTarget);
    const target = query.data;

    if (query.isPending) return <Spinner />;
    if (!target && query.error instanceof GaiaApiError && query.error.status === 403) {
        return <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="advanced-lemonade-pc-only" />;
    }
    if (!target) {
        return (
            <Stack gap="sm">
                <Notice tone="warning" message={t('settings.server.readFailed')} />
                <RawDetails text={technicalDetail(query.error)} />
            </Stack>
        );
    }

    const external = target.mode === 'external';
    const fromEnv = target.source === 'env';
    const url = isolate(target.base_url ?? '', 'ltr');

    return (
        <Stack gap="sm">
            <Text role="body">
                {fromEnv
                    ? t('settings.server.usesEnv', { url })
                    : external
                      ? t('settings.server.usesYours', { url })
                      : t('settings.server.usesOwn')}
            </Text>
            {!fromEnv && target.env_url_ignored ? (
                <Text role="caption" tone="muted">{t('settings.server.envIgnored', { url: isolate(target.env_url_ignored, 'ltr') })}</Text>
            ) : null}
            {fromEnv ? (
                <Text role="caption" tone="muted">{t('settings.server.envUseOwn')}</Text>
            ) : (
                <>
                    <Text role="caption" tone="muted">{t('settings.server.useYours')}</Text>
                    <Text role="caption" tone="muted">{t('setup.offer.whatGaiaDoesText')}</Text>
                    {saveRefused ? <PcOnlyNotice testID="advanced-lemonade-pc-only" /> : <OwnServerForm target={target} />}
                </>
            )}
            {external && !saveRefused ? (
                <Button
                    label={t('settings.server.useOwn')}
                    variant="secondary"
                    full
                    busy={save.isPending}
                    disabled={save.isPending}
                    onPress={() =>
                        save.mutate(
                            { mode: 'gaia' },
                            {
                                // Saved, but GAIA's own isn't installed yet: setup installs it.
                                onSuccess: (next) => {
                                    if (next.mode !== 'gaia' || next.gaia_installed) return;
                                    router.replace('/');
                                    reopenSetup();
                                },
                            },
                        )
                    }
                    testID="advanced-use-own"
                />
            ) : null}
            {fromEnv && external && saveRefused ? <PcOnlyNotice testID="advanced-lemonade-pc-only" /> : null}
            {save.isError ? <ActionError error={save.error} title={t('settings.server.notSwitched')} /> : null}
        </Stack>
    );
}
