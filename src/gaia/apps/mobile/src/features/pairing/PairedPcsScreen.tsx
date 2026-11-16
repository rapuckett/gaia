// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import { ActionSheet, Badge, Button, EmptyState, ErrorState, Icon, IconButton, ListRow, ListSkeleton, Notice, Row, Screen, Sheet, Stack, Text } from '@/ui';
import { Cpu, Ellipsis, Plus, Trash2 } from '@/ui/icons';

import { routeKindOf, useActiveConnection } from './routes';
import { isCurrentPc, useForgetPc, usePairedPcs, useUsePc } from './pairedPcs';
import type { PairedPc } from './service';

/** The PCs this phone is paired with: switch to one, forget one after a confirmation, or pair another. */
export function PairedPcsScreen({ onAdd }: { onAdd: () => void }) {
    const t = useT();
    const pcs = usePairedPcs();
    const connection = useActiveConnection();
    const kind = routeKindOf(connection);
    const routeKey = kind === 'home' ? 'mobileApp.pairing.route.home' : kind === 'tailnet' ? 'mobileApp.pairing.route.tailnet' : null;
    const use = useUsePc();
    const forget = useForgetPc();
    const [target, setTarget] = useState<{ pc: PairedPc; mode: 'menu' | 'confirm' } | null>(null);
    const close = () => setTarget(null);
    const pc = target?.pc;
    const failure = use.error ?? forget.error;

    return (
        <Screen scroll header={<ScreenHeader title={t('mobileApp.pairing.pcs.title')} />}>
            <Stack gap="md" paddingY="md">
                {failure ? (
                    <Stack paddingX="lg">
                        <Notice tone="danger" message={describeError(failure, t)} />
                    </Stack>
                ) : null}
                {pcs.isPending ? <ListSkeleton rows={3} /> : null}
                {pcs.error ? <ErrorState title={describeError(pcs.error, t)} onRetry={() => void pcs.refetch()} /> : null}
                {pcs.data?.length === 0 ? <EmptyState title={t('mobileApp.pairing.pcs.empty')} /> : null}
                {pcs.data?.map((item) => {
                    const current = isCurrentPc(item, connection);
                    return (
                        <ListRow
                            key={item.id}
                            title={item.name}
                            subtitle={current && routeKey ? t(routeKey) : undefined}
                            subtitleLines={2}
                            selected={current}
                            leading={<Icon icon={Cpu} size="md" tone="secondary" />}
                            onPress={current ? undefined : () => use.mutate(item)}
                            trailing={
                                <Row gap="xs">
                                    {current ? (
                                        <Badge tone="success" label={t('mobileApp.pairing.pcs.inUse')} />
                                    ) : (
                                        <Button
                                            label={t.bare('mobileApp.pairing.pcs.use')}
                                            accessibilityLabel={t('mobileApp.pairing.pcs.use')}
                                            size="sm"
                                            variant="secondary"
                                            disabled={use.isPending}
                                            onPress={() => use.mutate(item)}
                                            testID={`pc-row-${item.id}-use`}
                                        />
                                    )}
                                    <IconButton
                                        icon={Ellipsis}
                                        size="sm"
                                        label={t('mobileApp.pairing.pcs.more', { name: item.name })}
                                        onPress={() => setTarget({ pc: item, mode: 'menu' })}
                                        testID={`pc-row-${item.id}-more`}
                                    />
                                </Row>
                            }
                        />
                    );
                })}
                <Stack paddingX="lg">
                    <Button label={t('mobileApp.pairing.pcs.add')} icon={Plus} variant="secondary" onPress={onAdd} />
                </Stack>
            </Stack>
            <ActionSheet
                open={target?.mode === 'menu'}
                onClose={close}
                title={pc?.name}
                actions={[
                    ...(pc && !isCurrentPc(pc, connection) ? [{ label: t('mobileApp.pairing.pcs.use'), onPress: () => use.mutate(pc) }] : []),
                    { label: t('mobileApp.pairing.pcs.forget'), icon: Trash2, destructive: true, onPress: () => pc && setTarget({ pc, mode: 'confirm' }) },
                ]}
            />
            <Sheet open={target?.mode === 'confirm'} onClose={close} title={t('mobileApp.pairing.pcs.forgetTitle', { name: pc?.name ?? '' })}>
                <Stack gap="md">
                    <Text tone="secondary">{t('mobileApp.pairing.pcs.forgetBody')}</Text>
                    <Row gap="sm" stack>
                        <Button label={t('mobileApp.pairing.waiting.cancel')} variant="secondary" onPress={close} />
                        <Button
                            label={t('mobileApp.pairing.pcs.forgetConfirm', { name: pc?.name ?? '' })}
                            variant="danger"
                            testID="pc-forget-confirm"
                            onPress={() => {
                                close();
                                if (pc) forget.mutate(pc);
                            }}
                        />
                    </Row>
                </Stack>
            </Sheet>
        </Screen>
    );
}
