// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { connectedProviderLabel, referencedProviderConnected } from '@webui/utils/connectorRetry.core';

import type { ConnectorListEntry } from '@/api/client.types';
import { useConnectorWatch } from '@/data';
import { useT } from '@/i18n/useT';
import { Notice, Stack } from '@/ui';

export interface ConnectorRetryProps {
    /** The newest reply: a connector sign-in error. */
    content: string;
    /** The connectors the reply's Connect card waits on; empty when it has none. */
    providers?: string[];
    /** Per provider, the account that card offered to sign in to again. */
    accounts?: Record<string, string>;
    /** Asks the last question again. */
    onRetry(): void;
}

/** Once the account a connector-error reply asked for is connected, offers to run that question again. */
export function ConnectorRetry({ content, providers = [], accounts = {}, onRetry }: ConnectorRetryProps) {
    const t = useT();
    const [dismissed, setDismissed] = useState(false);
    // The connectors as this reply first saw them: only a change since counts as the fix.
    const [before, setBefore] = useState<ConnectorListEntry[] | null>(null);
    const connectors = useConnectorWatch(true, (list) => before !== null && referencedProviderConnected(content, list?.connectors ?? [], providers, before, accounts));
    const list = connectors.data?.connectors ?? [];
    if (before === null && connectors.data) setBefore(list);
    if (dismissed || before === null || !referencedProviderConnected(content, list, providers, before, accounts)) return null;
    return (
        <Stack paddingX="lg" testID="connector-retry">
            <Notice
                tone="success"
                message={t('mobileApp.connectorRetry.connected', { name: connectedProviderLabel(content, list, providers, before, accounts) })}
                action={{
                    label: t('mobileApp.connectorRetry.askAgain'),
                    onPress: () => {
                        setDismissed(true);
                        onRetry();
                    },
                }}
                onDismiss={() => setDismissed(true)}
            />
        </Stack>
    );
}
