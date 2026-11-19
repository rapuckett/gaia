// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import type { ConnectorRow } from '@/api/client.types';
import { useT } from '@/i18n/useT';
import { Ltr, Text } from '@/ui';

import { oauthClientStatus } from './connectorList';

/** The OAuth client the PC uses: its label on one line, the id below as a literal value on one line, cut in the middle. */
export function OAuthClientLine({ connector, emphasis, testID }: { connector: ConnectorRow; emphasis?: boolean; testID?: string }) {
    const t = useT();
    const { label, id } = oauthClientStatus(connector, t);
    return (
        <View accessible accessibilityLabel={id ? `${label} ${id}` : label} testID={testID}>
            <Text role="label" weight={emphasis ? 'semibold' : undefined} tone={emphasis ? undefined : 'secondary'}>
                {label}
            </Text>
            {id ? (
                <Text role="label" tone="secondary" dir="ltr" numberOfLines={1} largeLines={1} ellipsize="middle">
                    <Ltr>{id}</Ltr>
                </Text>
            ) : null}
        </View>
    );
}
