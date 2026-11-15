// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { cardText } from '@webui/components/startCardText';
import type { StartCard } from '@webui/types';
import { router } from 'expo-router';
import { useState } from 'react';

import { useSelectModel, useStartScreen } from '@/data';
import { shortModelName } from '@/features/new-chat/warmUp';
import { describeError, useT } from '@/i18n/useT';
import { Button, Card, Notice, Stack, Text } from '@/ui';

import { SetupFooter } from '../SetupFooter';
import type { SetupStepContext } from '../SetupScreen';
import { readyView, starterCards } from './readyView';

/** The last step: what answers, what to know about, and tasks to start with. Done opens the app. */
export function ReadyStep({ ctx }: { ctx: SetupStepContext }) {
    const t = useT();
    const select = useSelectModel();
    const cards = starterCards(useStartScreen().data?.cards);
    const [error, setError] = useState<string | null>(null);
    const view = readyView(ctx.run, ctx.plan);
    const names = new Map((ctx.plan?.catalog ?? []).map((e) => [e.id, e.name]));
    const model = view.answering ? (view.cloud ? shortModelName(view.answering) : names.get(view.answering) ?? shortModelName(view.answering)) : null;

    // Chat opens on the model setup set up and tested, not an older pick; a cloud setup keeps its model.
    const finish = async (first?: StartCard) => {
        setError(null);
        try {
            if (!view.cloud && view.answering) await select.mutateAsync(view.answering);
        } catch (err) {
            setError(describeError(err, t));
            return;
        }
        ctx.finish();
        if (first) router.replace({ pathname: '/new', params: { prompt: first.prompt, promptId: `start:${first.skill}` } });
    };

    return (
        <Stack gap="md">
            <Text role="title" weight="semibold" accessibilityRole="header">{t('setup.ready.heading')}</Text>
            {model ? (
                <Text accessibilityRole="summary">
                    {t(view.cloud ? 'setup.ready.answersCloud' : 'setup.ready.answersLocal', { model })}
                </Text>
            ) : null}
            {error ? <Notice tone="danger" message={error} /> : null}
            {view.failedJobs.map((job) => (
                <Notice key={job} tone="warning" message={t('setup.ready.extraFailed', { job: t(`setup.test.job.${job}`) })} />
            ))}
            {view.notDownloaded.length > 0 ? (
                <Notice tone="warning" message={t('setup.ready.extraNotFetched', { names: view.notDownloaded.join(', ') })} />
            ) : null}
            {cards.length > 0 ? (
                <Stack gap="sm">
                    <Text tone="secondary" accessibilityLabel={t('newChat.cardsLabel')}>{t('setup.ready.tasks')}</Text>
                    {cards.map((card) => {
                        const { title, note } = cardText(card, t);
                        return (
                            <Card key={card.skill} onPress={() => void finish(card)} accessibilityLabel={`${title}. ${note}`}>
                                <Stack gap="xs">
                                    <Text weight="semibold">{title}</Text>
                                    <Text role="caption" tone="secondary">{note}</Text>
                                </Stack>
                            </Card>
                        );
                    })}
                </Stack>
            ) : null}
            <SetupFooter>
                <Button label={t('setup.ready.start')} variant="primary" full busy={select.isPending} onPress={() => void finish()} />
            </SetupFooter>
        </Stack>
    );
}
