// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';

import type { SkillInfo } from '@/api/client.types';
import { useSkills } from '@/data';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import {
    Badge,
    Button,
    Disclosure,
    EmptyState,
    ErrorState,
    ListSkeleton,
    Notice,
    Pressable,
    Row,
    Screen,
    SearchField,
    Stack,
    Text,
} from '@/ui';

import { filterSkills, GROUPS, isGrouped, SEARCH_ABOVE, SKILLS_HOW_PARAMS, skippedName, skipReason } from './skillList';

// A description longer than this is cut at two lines, with Show more.
const CUT_ABOVE_CHARS = 110;

export function SkillsScreen({ onTry }: { onTry: (name: string, prompt: string) => void }) {
    const t = useT();
    const skills = useSkills();
    const [query, setQuery] = useState('');
    const [howOpen, setHowOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

    const all = skills.data?.skills ?? [];
    const invalid = Object.entries(skills.data?.invalid ?? {});
    const q = query.trim();
    const shown = useMemo(() => filterSkills(all, query), [all, query]);
    const grouped = isGrouped(all);

    const groupOpen = (id: string, byDefault: boolean) => !!q || (openGroups[id] ?? byDefault);
    const toggleGroup = (id: string, byDefault: boolean) => () =>
        setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? byDefault) }));
    const row = (s: SkillInfo) => (
        <SkillRow key={s.name} skill={s} onTry={() => onTry(s.name, t('settings.skills.tryPrompt', { name: s.name }))} />
    );

    return (
        <Screen scroll header={<ScreenHeader title={t('settings.section.skills')} />}>
            <Stack gap="md" paddingX="lg" paddingY="md">
                <Text tone="secondary">{t('settings.skills.lede')}</Text>
                <Disclosure title={t('settings.model.howItWorks')} open={howOpen} onToggle={() => setHowOpen(!howOpen)}>
                    <Text role="caption" tone="muted">{t('settings.skills.how', SKILLS_HOW_PARAMS)}</Text>
                </Disclosure>
                {skills.error ? (
                    <ErrorState title={describeError(skills.error, t)} onRetry={() => void skills.refetch()} />
                ) : skills.isPending ? (
                    <ListSkeleton rows={6} />
                ) : (
                    <>
                        {all.length > SEARCH_ABOVE ? (
                            <SearchField
                                value={query}
                                onChangeText={setQuery}
                                placeholder={t('settings.skills.search')}
                                accessibilityLabel={t('settings.skills.search')}
                            />
                        ) : null}
                        {all.length === 0 ? <EmptyState title={t('settings.skills.none')} /> : null}
                        {q && all.length > 0 && shown.length === 0 ? (
                            <Stack gap="xs">
                                <Text tone="muted">{t('settings.skills.noMatch', { query: q })}</Text>
                                <Button label={t('settings.skills.clearSearch')} variant="ghost" size="sm" onPress={() => setQuery('')} />
                            </Stack>
                        ) : null}
                        {grouped
                            ? GROUPS.map((g) => {
                                  const rows = shown.filter((s) => s.source === g.source);
                                  if (rows.length === 0 && (q || !g.empty)) return null;
                                  const byDefault = g.source === 'agent-bundled' || (g.source === 'user' && rows.length > 0);
                                  return (
                                      <Disclosure
                                          key={g.source}
                                          title={t(g.title)}
                                          open={groupOpen(g.source, byDefault)}
                                          onToggle={toggleGroup(g.source, byDefault)}
                                          trailing={<Badge label={String(rows.length)} />}
                                      >
                                          <Stack gap="sm">
                                              <Text role="caption" tone="muted">{t(g.note, g.params)}</Text>
                                              {rows.length === 0 && g.empty ? (
                                                  <Text role="caption" tone="muted">{t(g.empty, g.params)}</Text>
                                              ) : (
                                                  rows.map(row)
                                              )}
                                          </Stack>
                                      </Disclosure>
                                  );
                              })
                            : shown.map(row)}
                        {invalid.length > 0 ? (
                            <Stack gap="xs">
                                <Text role="label" weight="medium" tone="secondary">{t('settings.skills.skipped')}</Text>
                                {invalid.map(([path, why]) => (
                                    <Notice key={path} tone="warning" message={t(skipReason(why), { name: skippedName(path) })} />
                                ))}
                            </Stack>
                        ) : null}
                    </>
                )}
            </Stack>
        </Screen>
    );
}

function SkillRow({ skill, onTry }: { skill: SkillInfo; onTry: () => void }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const long = skill.description.length > CUT_ABOVE_CHARS;
    return (
        <Stack gap="xs">
            <Text weight="medium">
                {skill.name}
                {skill.always_on ? <Text tone="muted">{` · ${t('settings.skills.alwaysOn')}`}</Text> : null}
            </Text>
            <Text role="caption" tone="secondary" numberOfLines={open ? undefined : 2}>{skill.description}</Text>
            <Row gap="sm">
                {long ? (
                    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                        <Text role="caption" tone="accent">{t(open ? 'settings.skills.less' : 'settings.skills.more')}</Text>
                    </Pressable>
                ) : null}
                {!skill.always_on ? (
                    <Button
                        label={t('settings.skills.try')}
                        onPress={onTry}
                        variant="secondary"
                        size="sm"
                    />
                ) : null}
            </Row>
        </Stack>
    );
}
