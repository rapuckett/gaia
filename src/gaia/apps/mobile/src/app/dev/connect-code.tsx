// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';

import type { ConnectorRow } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ConnectAccountCard } from '@/features/chat/cards/ConnectAccountCard';
import { EmailConnect } from '@/features/chat/EmailConnect';
import { GrantNote } from '@/features/chat/GrantNote';
import { BrowserSignInDepsContext } from '@/features/connectors/browserSignIn';
import { CANCELLED, galleryDeps } from '@/features/connectors/ConnectorsGallery';
import { DeviceCodeBlock } from '@/features/connectors/DeviceCodeSignIn';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { Screen, Stack, Text, UIProvider } from '@/ui';

const CODE = { user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', expires_in: 900, interval: 5, message: '' };

const account = (id: string, display_name: string, over: Partial<ConnectorRow> = {}) =>
    ({
        id,
        display_name,
        type: 'oauth_pkce',
        description: '',
        configured: false,
        configurable: true,
        supports_device_code: id !== 'google',
        scopes: [],
        default_scopes: ['openid'],
        available_scopes: ['openid', 'Mail.Read'],
        oauth_setup_fields: [],
        account_id: null,
        activations: {},
        ...over,
    }) as unknown as ConnectorRow;

// One each for the screen: the sign-in they show is kept per deps, and a new one each render would start over.
const GOOGLE_DEPS = galleryDeps(null);
// Opens on a sign-in whose browser closed unfinished; Connect starts another that ends the same way.
const GOOGLE_CANCELLED_DEPS = galleryDeps({ outcome: 'cancelled' }, CANCELLED);

const MAILBOXES = [account('google', 'Google'), account('microsoft', 'Microsoft Personal'), account('microsoft_work', 'Microsoft Work or School')];

function Faked({ data, children }: { data: FakeClientData; children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => createFakeClient(data));
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>{children}</GaiaClientProvider>
        </QueryClientProvider>
    );
}

function Scene({ title, children }: { title: string; children: ReactNode }) {
    return (
        <Stack gap="sm">
            <Text role="caption" tone="muted">{title}</Text>
            {children}
        </Stack>
    );
}

/** `?state=googleCancelled`: the chat card alone, after Google's sign-in closed unfinished. */
export default function ConnectCodeGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    const card = { kind: 'connect_account', providers: ['microsoft', 'google'], agent_id: 'builtin:gaia', scopes: { microsoft: ['Mail.Read'] } };
    if (state === 'googleCancelled') {
        return (
            <UIProvider>
                <Screen scroll>
                    <Stack gap="xl" padding="lg">
                        <Faked data={{ connectors: MAILBOXES, browserSignInState: 'gallery-state-0123456789abcdefghijklmnopqrstuv' }}>
                            <BrowserSignInDepsContext.Provider value={GOOGLE_CANCELLED_DEPS}>
                                <ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />
                            </BrowserSignInDepsContext.Provider>
                        </Faked>
                    </Stack>
                </Screen>
            </UIProvider>
        );
    }
    return (
        <UIProvider>
            <Screen scroll>
                <Stack gap="xl" padding="lg">
                    <Scene title={'Connect card: to sign in'}>
                        <Faked data={{ connectors: MAILBOXES, deviceSignIn: CODE }}>
                            <ConnectAccountCard data={card} />
                        </Faked>
                    </Scene>
                    <Scene title={'Connect card: connected, needing setup, and a start the PC refused'}>
                        <Faked data={{ connectors: [account('microsoft', 'Microsoft Personal', { configured: true }), account('google', 'Google', { configurable: false })] }}>
                            <ConnectAccountCard data={card} />
                        </Faked>
                    </Scene>
                    <Scene title={'Connect card: sign-in cancelled'}>
                        <Faked data={{ connectors: MAILBOXES, deviceSignIn: CODE, signInEnd: { outcome: 'cancelled' } }}>
                            <ConnectAccountCard data={{ kind: 'connect_account', providers: ['microsoft'] }} />
                        </Faked>
                    </Scene>
                    <Scene title={'Connect card: Google on a paired phone signs in with the phone browser'}>
                        <Faked data={{ connectors: MAILBOXES, browserSignInState: 'gallery-state-0123456789abcdefghijklmnopqrstuv' }}>
                            <BrowserSignInDepsContext.Provider value={GOOGLE_DEPS}>
                                <ConnectAccountCard data={{ kind: 'connect_account', providers: ['google'] }} />
                            </BrowserSignInDepsContext.Provider>
                        </Faked>
                    </Scene>
                    <Scene title={'Email connect on a reply'}>
                        <Faked data={{ connectors: MAILBOXES, deviceSignIn: CODE, signInEnd: { outcome: 'failed' } }}>
                            <EmailConnect content="NOT_CONNECTED: no mailbox is connected." />
                        </Faked>
                    </Scene>
                    <Scene title={'Connected, but the agent is not granted'}>
                        <GrantNote />
                    </Scene>
                    <Scene title={'Waiting for sign-in'}>
                        <DeviceCodeBlock code={CODE} />
                    </Scene>
                    <Scene title={'Sign-in page that is not https'}>
                        <DeviceCodeBlock code={{ ...CODE, verification_uri: 'http://example.com/devicelogin' }} />
                    </Scene>
                </Stack>
            </Screen>
        </UIProvider>
    );
}
