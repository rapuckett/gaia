// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { PairingError, PairingScanner, pairingApi, usePairedPc } from '@/features/pairing';
import { Button, Screen, Stack, Text, TextField } from '@/ui';

function describe(err: unknown): string {
    if (err instanceof PairingError) return `${err.code}: ${err.message}`;
    return err instanceof Error ? err.message : String(err);
}

/** Development only: pairs with a code passed as `?code=` or pasted, to exercise the pinned transport. */
export default function DevPairRoute() {
    const { code } = useLocalSearchParams<{ code?: string }>();
    const { loaded, pc } = usePairedPc();
    const [text, setText] = useState(code ?? '');
    const [last, setLast] = useState('none');
    const [scanning, setScanning] = useState(false);

    async function run(label: string, action: () => Promise<string>) {
        setLast(`${label}…`);
        try {
            setLast(`${label}: ${await action()}`);
        } catch (err) {
            setLast(`${label} failed: ${describe(err)}`);
        }
    }

    function pair(value: string) {
        void run('pair', async () => {
            const done = await pairingApi.redeem(pairingApi.parseOffer(value), 'mobile-iphone');
            return `${done.name} at ${done.origin}, ${done.status}`;
        });
    }

    useEffect(() => {
        if (code && loaded) pair(code);
        // Pairs once per code the link carries.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, loaded]);

    if (!__DEV__) return <Redirect href="/" />;
    return (
        <Screen scroll>
            <Stack gap="lg" padding="lg">
                <Text testID="pair-current">{pc ? `Paired: ${pc.name} at ${pc.origin}, ${pc.status}` : 'Not paired'}</Text>
                <Text testID="pair-last" role="caption" tone="muted">{`Last: ${last}`}</Text>
                <TextField value={text} onChangeText={setText} label="Pairing code" multiline maxLines={4} />
                <Button label="Pair" variant="primary" onPress={() => pair(text)} testID="pair-go" />
                {pc && (
                    <>
                        <Button label="Check status" onPress={() => void run('status', () => pairingApi.status(pc.pcId))} testID="pair-status" />
                        <Button
                            label="Forget"
                            variant="danger"
                            onPress={() => void run('forget', async () => (await pairingApi.forget(pc.pcId), 'done'))}
                            testID="pair-forget"
                        />
                    </>
                )}
                <Button label={scanning ? 'Stop scanning' : 'Scan'} onPress={() => setScanning((s) => !s)} />
                {scanning && <PairingScanner onCode={(scanned) => { setScanning(false); pair(scanned); }} />}
            </Stack>
        </Screen>
    );
}
