// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import type { ConnectorRow } from '@/api/client.types';
import { useDeviceSignIn } from '@/data';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { useAnnounce } from '@/platform/useAnnounce';
import { Button, Notice, Stack } from '@/ui';
import { ExternalLink } from '@/ui/icons';

import { BrowserSignInWaiting, browserSignInNotice } from './BrowserSignInBlock';
import { useBrowserSignIn, useBrowserSignInAvailable } from './browserSignIn';
import { GOOGLE_CONNECTOR_ID } from './connectorList';
import { DeviceCodeBlock, signInEndedNotice } from './DeviceCodeSignIn';

export interface ProviderConnectProps {
    connectorId: string;
    /** The connector as the PC lists it; without it, or without `supports_device_code`, sign-in is the browser's (Google on a paired phone) or the PC's. */
    row?: ConnectorRow;
    label: string;
    /** The label once a sign-in started here stopped without connecting. */
    againLabel?: string;
    /** What the sign-in asks for; everything the connector offers when unset. */
    scopes?: string[];
    /** Takes over saying why a sign-in stopped; without it the button says so itself. */
    onEnded?(why: 'cancelled' | 'failed'): void;
    onStarted?(): void;
}

/** One provider's Connect button: a sign-in with a code where the PC offers one, Google's in this phone's browser, else the PC-only note. */
export function ProviderConnect(props: ProviderConnectProps) {
    const browserAvailable = useBrowserSignInAvailable();
    if (props.row?.supports_device_code) return <CodeConnect {...props} row={props.row} />;
    if (props.row && props.connectorId === GOOGLE_CONNECTOR_ID && browserAvailable) return <BrowserConnect {...props} row={props.row} />;
    return <PcOnlyConnect {...props} />;
}

function PcOnlyConnect({ connectorId, label }: ProviderConnectProps) {
    const t = useT();
    const [shown, setShown] = useState(false);
    return (
        <Stack gap="sm">
            <Stack align="start">
                <Button size="sm" variant="secondary" icon={ExternalLink} wrap label={label} onPress={() => setShown(true)} testID={`connect-${connectorId}`} />
            </Stack>
            {shown ? <Notice tone="info" role="status" message={t('mobileApp.connectCard.onPc')} /> : null}
        </Stack>
    );
}

function CodeConnect({ connectorId, row, label, againLabel, scopes, onEnded, onStarted }: ProviderConnectProps & { row: ConnectorRow }) {
    const t = useT();
    const { signIn, start, cancel } = useDeviceSignIn(row, scopes);
    const [tried, setTried] = useState(false);
    const why = signIn.state === 'expired' ? 'failed' : signIn.state === 'ended' ? signIn.why : null;
    useEffect(() => {
        if (why) onEnded?.(why);
    }, [why, onEnded]);

    if (signIn.state === 'waiting') return <DeviceCodeBlock code={signIn.code} onCancel={cancel} />;
    return (
        <Stack gap="sm">
            <Stack align="start">
                <Button
                    size="sm"
                    variant="secondary"
                    icon={ExternalLink}
                    wrap
                    label={tried && againLabel ? againLabel : label}
                    busy={signIn.state === 'starting'}
                    onPress={() => {
                        setTried(true);
                        onStarted?.();
                        start();
                    }}
                    testID={`connect-${connectorId}`}
                />
            </Stack>
            {signIn.state === 'failed' ? <Notice tone="danger" message={describeHttpFailure(signIn.error, t).text} detail={describeHttpFailure(signIn.error, t).detail} /> : null}
            {signIn.state === 'ended' && (signIn.error || !onEnded) ? <Notice tone="danger" {...signInEndedNotice(signIn, t)} /> : null}
            {signIn.state === 'expired' && !onEnded ? <Notice tone="danger" message={t('connectCard.failed')} /> : null}
        </Stack>
    );
}

function BrowserConnect({ connectorId, row, label, againLabel, scopes, onEnded, onStarted }: ProviderConnectProps & { row: ConnectorRow }) {
    const t = useT();
    const { signIn, start, cancel } = useBrowserSignIn(row, scopes);
    const [tried, setTried] = useState(false);
    const closed = signIn.state === 'failed' && signIn.reason === 'closed';
    useEffect(() => {
        if (closed) onEnded?.('cancelled');
    }, [closed, onEnded]);
    // With onEnded the caller shows and speaks the line.
    useAnnounce(closed && !onEnded ? t('connectCard.cancelled') : null);

    if (signIn.state === 'done') return null;
    if (signIn.state === 'browser' || signIn.state === 'finishing') return <BrowserSignInWaiting state={signIn.state} name={row.display_name} onCancel={cancel} />;
    return (
        <Stack gap="sm">
            <Stack align="start">
                <Button
                    size="sm"
                    variant="secondary"
                    icon={ExternalLink}
                    wrap
                    label={tried && againLabel ? againLabel : label}
                    busy={signIn.state === 'starting'}
                    onPress={() => {
                        setTried(true);
                        onStarted?.();
                        start();
                    }}
                    testID={`connect-${connectorId}`}
                />
            </Stack>
            {signIn.state === 'failed' && (!closed || !onEnded) ? (
                <Notice tone={closed ? 'info' : 'danger'} {...browserSignInNotice(signIn, row.display_name, t)} />
            ) : null}
        </Stack>
    );
}
