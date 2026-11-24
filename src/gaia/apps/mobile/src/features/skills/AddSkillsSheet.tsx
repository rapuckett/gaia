// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';

import type { FeaturedLibrary, LinkAddResult, LinkPreview, LinkSkill } from '@/api/client.types';
import { ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { GaiaApiError } from '@/api/errors';
import { useGaiaClient } from '@/data';
import { queryKeys } from '@/data/queries';
import { describeHttpFailure, technicalDetail, useT, type Translate } from '@/i18n/useT';
import { Badge, Button, Disclosure, Divider, Ltr, Notice, Row, Sheet, Stack, Switch, TextField, Text } from '@/ui';

import { useConfirmSheet } from '../setup/sheets/ConfirmSheet';
import { ChipButton } from '../schedules/ChipButton';

/** Dev scenes only: reads this link on arrival, ticks the code opt-in, and adds what can be added. */
export interface SkillsAddSeed {
    read?: string;
    allowCode?: boolean;
    add?: boolean;
    /** Presses Add with the code opt-in on, so the confirm sheet opens. */
    confirm?: boolean;
}

/** Ready to add: readable, not blocked, new or an update, and code only when allowed. */
const addable = (s: LinkSkill, allowCode: boolean) => !s.error && (!s.installed || s.update) && (allowCode || !s.has_code);

function summarize(result: LinkAddResult, t: Translate): string {
    const part = (verb: 'added' | 'updated', names: string[]) =>
        names.length > 3
            ? t(`settings.skills.link.${verb}Count`, { n: names.length })
            : t(`settings.skills.link.${verb}`, { names: names.map((n) => isolate(n, 'ltr')).join(', ') });
    const added = result.added.filter((a) => !a.updated).map((a) => a.name);
    const updated = result.added.filter((a) => a.updated).map((a) => a.name);
    return [added.length ? part('added', added) : '', updated.length ? part('updated', updated) : ''].filter(Boolean).join(' ');
}

/**
 * Reads and audits a link, then adds the chosen skills when the PC lets this phone (the PC's own flow). Where the PC
 * keeps the add to itself, the phone hands the link over to it.
 */
export function AddSkillsSheet({ open, onClose, seed }: { open: boolean; onClose: () => void; seed?: SkillsAddSeed }) {
    const t = useT();
    const client = useGaiaClient();
    const routeRefused = useDeviceRefused('POST', ENDPOINTS.skillsLinkAdd);
    const [denied, setDenied] = useState(false);
    const refused = routeRefused || denied;
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [allowCode, setAllowCode] = useState(!!seed?.allowCode);
    const { ask, sheet: confirmSheet } = useConfirmSheet();
    const [adding, setAdding] = useState(false);
    const [failedOpen, setFailedOpen] = useState(false);
    const queryClient = useQueryClient();
    const [result, setResult] = useState<LinkAddResult | null>(null);
    const [url, setUrl] = useState(seed?.read ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
    const [preview, setPreview] = useState<LinkPreview | null>(null);
    const [featured, setFeatured] = useState<FeaturedLibrary[]>([]);
    const [featuredError, setFeaturedError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !client) return;
        const controller = new AbortController();
        client
            .listFeaturedSkillLibraries({ signal: controller.signal })
            .then((r) => setFeatured(r.libraries))
            .catch((err) => {
                if (!controller.signal.aborted) setFeaturedError(technicalDetail(err));
            });
        return () => controller.abort();
    }, [open, client, t]);

    const read = async (link: string, withCode = false): Promise<LinkPreview | null> => {
        const trimmed = link.trim();
        if (!trimmed || !client) return null;
        setBusy(true);
        setError(null);
        setPreview(null);
        setResult(null);
        try {
            const p = await client.previewSkillLink(trimmed);
            setPreview(p);
            setPicked(new Set(p.skills.filter((s) => addable(s, withCode)).map((s) => s.name)));
            return p;
        } catch (err) {
            setError(describeHttpFailure(err, t));
            return null;
        } finally {
            setBusy(false);
        }
    };

    const add = async (from: LinkPreview, names: string[], withCode: boolean) => {
        if (!client || names.length === 0) return;
        setAdding(true);
        setError(null);
        try {
            const r = await client.addSkillsFromLink({ url: from.link, names, pin: from.pin, allowCode: withCode });
            setResult(r);
            setPreview(null);
            setUrl('');
            if (r.added.length) await queryClient.invalidateQueries({ queryKey: queryKeys.skills });
        } catch (err) {
            if (err instanceof GaiaApiError && err.status === 403) setDenied(true);
            else setError(describeHttpFailure(err, t));
        } finally {
            setAdding(false);
        }
    };

    const submit = async (from: LinkPreview, names: string[], withCode: boolean) => {
        const shipsCode = withCode && from.skills.some((s) => names.includes(s.name) && s.has_code);
        if (shipsCode) {
            const sure = await ask({
                title: t('mobileApp.skills.link.codeConfirm.title'),
                body: [t('mobileApp.skills.link.codeConfirm.body')],
                note: t('mobileApp.skills.link.codeConfirm.audit'),
                confirmLabel: t('mobileApp.skills.link.codeConfirm.yes'),
                cancelLabel: t('settings.skills.link.cancel'),
            });
            if (!sure) return;
        }
        await add(from, names, withCode);
    };

    const seeded = useRef(false);
    useEffect(() => {
        if (!open || !client || !seed?.read || seeded.current) return;
        seeded.current = true;
        void read(seed.read, !!seed.allowCode).then((p) => {
            if (p && (seed.add || seed.confirm)) {
                const names = p.skills.filter((s) => addable(s, !!seed.allowCode)).map((s) => s.name);
                void (seed.confirm ? submit : add)(p, names, !!seed.allowCode);
            }
        });
        // Runs once per sheet opening; read and add are re-made every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, client, seed]);

    const close = () => {
        setPreview(null);
        setResult(null);
        setError(null);
        setAllowCode(false);
        onClose();
    };

    const toggle = (name: string) =>
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });

    const toggleCode = (on: boolean) => {
        setAllowCode(on);
        if (!on && preview) {
            const code = new Set(preview.skills.filter((s) => s.has_code).map((s) => s.name));
            setPicked((prev) => new Set([...prev].filter((n) => !code.has(n))));
        }
    };

    const hasCode = preview?.skills.some((s) => s.has_code && !s.error) ?? false;
    const shareable = preview?.skills.some((s) => !s.error && (!s.installed || s.update)) ?? false;
    const failed = Object.entries(result?.failed ?? {});

    return (
        <Sheet
            open={open}
            onClose={close}
            title={t('settings.skills.link.title')}
            scrollTestID="add-skills-scroll"
            footer={
                !refused && preview ? (
                    <Button
                        label={t('settings.skills.link.add', { n: picked.size })}
                        full
                        disabled={picked.size === 0 || adding}
                        onPress={() => void submit(preview, [...picked], allowCode)}
                        testID="skills-link-add"
                    />
                ) : !refused && result ? (
                    <Button label={t('cards.done')} variant="secondary" full onPress={close} />
                ) : refused && preview && shareable ? (
                    <Button
                        label={t('mobileApp.skills.shareLink')}
                        full
                        onPress={() => void Share.share({ message: preview.link })}
                    />
                ) : (
                    <Button label={t('settings.skills.link.cancel')} variant="secondary" full onPress={close} />
                )
            }
        >
            <Stack gap="md">
                {featured.length > 0 ? (
                    <Row gap="sm" wrap>
                        {featured.map((f) => (
                            <ChipButton
                                key={f.id}
                                variant="plain"
                                label={t('settings.skills.link.get', { name: f.name })}
                                disabled={busy || adding}
                                onPress={() => {
                                    setUrl(f.url);
                                    void read(f.url);
                                }}
                            />
                        ))}
                    </Row>
                ) : null}
                {featuredError ? (
                    <Notice tone="danger" message={t('mobileApp.error.featuredLibrariesFailed')} detail={featuredError} />
                ) : null}
                <TextField
                    value={url}
                    onChangeText={setUrl}
                    url
                    placeholder={t.bare('mobileApp.skills.linkPlaceholder', {
                        github: isolate('GitHub', 'ltr'),
                        skills: isolate('skills.sh', 'ltr'),
                        zip: isolate('.zip', 'ltr'),
                    })}
                    accessibilityLabel={t('settings.skills.link.aria')}
                    hint={t('mobileApp.skills.linkHint', {
                        github: isolate('GitHub', 'ltr'),
                        repo: isolate('owner/repo', 'ltr'),
                        skills: isolate('skills.sh', 'ltr'),
                        https: isolate('https', 'ltr'),
                        zip: isolate('.zip', 'ltr'),
                    })}
                    returnKeyType="go"
                    onSubmitEditing={() => void read(url)}
                    disabled={busy || adding}
                />
                <Button
                    label={t(busy ? 'settings.skills.link.reading' : 'settings.skills.link.read')}
                    variant="secondary"
                    full
                    disabled={!url.trim() || busy || adding}
                    onPress={() => void read(url)}
                />
                {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
                {preview ? (
                    <Stack gap="md">
                        <Notice tone="warning" title={t('settings.skills.link.trust')} message={t('mobileApp.skills.trustBody')} />
                        <Text role="ui" tone="secondary">
                            {t('settings.skills.link.found', { n: preview.skills.length, source: preview.source })}
                        </Text>
                        <View>
                            {preview.skills.map((s, i) => (
                                <View key={s.path}>
                                    {i > 0 ? <Divider /> : null}
                                    <PreviewRow
                                        skill={s}
                                        refused={refused}
                                        allowCode={allowCode}
                                        picked={picked.has(s.name)}
                                        onToggle={() => toggle(s.name)}
                                    />
                                </View>
                            ))}
                        </View>
                        {!refused && hasCode ? (
                            <Switch
                                value={allowCode}
                                onValueChange={toggleCode}
                                label={t('settings.skills.link.includeCode')}
                                description={t('settings.skills.link.codeHint')}
                                descriptionBelow
                                disabled={adding}
                                testID="skills-link-include-code"
                            />
                        ) : null}
                        {refused && shareable ? (
                            <Notice
                                tone="info"
                                title={t('mobileApp.skills.pcTitle')}
                                message={`${t('mobileApp.skills.pcBody')}${hasCode ? ` ${t('mobileApp.skills.pcBodyCode')}` : ''}`}
                            />
                        ) : null}
                    </Stack>
                ) : null}
                {result ? (
                    <Stack gap="sm" testID="skills-link-result">
                        {result.added.length > 0 ? <Notice tone="success" message={summarize(result, t)} /> : null}
                        {failed.length > 0 ? (
                            <Disclosure
                                title={t('settings.skills.link.notAdded', { n: failed.length })}
                                open={failedOpen}
                                onToggle={() => setFailedOpen(!failedOpen)}
                            >
                                <Stack gap="xs">
                                    {failed.map(([name, why]) => (
                                        <Text key={name} role="label">
                                            <Ltr>{name}</Ltr>
                                            {` — ${why}`}
                                        </Text>
                                    ))}
                                </Stack>
                            </Disclosure>
                        ) : null}
                    </Stack>
                ) : null}
                {confirmSheet}
            </Stack>
        </Sheet>
    );
}

function PreviewRow({
    skill: s,
    refused,
    allowCode,
    picked,
    onToggle,
}: {
    skill: LinkSkill;
    refused: boolean;
    allowCode: boolean;
    picked: boolean;
    onToggle: () => void;
}) {
    const t = useT();
    const tag = s.error
        ? t(s.verdict === 'BLOCK' ? 'settings.skills.link.tagBlocked' : 'settings.skills.link.tagUnreadable')
        : s.installed && !s.update
          ? t('settings.skills.link.tagElsewhere')
          : s.update
            ? t('settings.skills.link.tagUpdate')
            : null;
    const why = s.error ?? (s.installed && !s.update ? t('settings.skills.link.whyElsewhere') : s.update ? t('settings.skills.link.whyUpdate') : null);
    const [open, setOpen] = useState(false);
    const can = !refused && addable(s, allowCode);
    const codeNote = s.has_code && (refused || !allowCode);
    const hasDetails = !!why || s.findings.length > 0 || codeNote;
    return (
        <View style={{ paddingVertical: 10 }}>
            <Stack gap="xs">
                <Row gap="sm" wrap>
                    <Text role="ui" weight="medium">{s.name}</Text>
                    {tag ? <Badge label={tag} tone={s.error ? 'danger' : 'neutral'} /> : null}
                    {s.has_code ? <Badge label={t('settings.skills.link.tagCode')} /> : null}
                    {s.verdict === 'REVIEW' ? <Badge label={t('settings.skills.link.tagReview')} tone="warning" /> : null}
                </Row>
                {s.description ? <Text role="label" tone="secondary">{s.description}</Text> : null}
                {!refused ? (
                    <Switch
                        value={can && picked}
                        onValueChange={onToggle}
                        label={t('settings.skills.link.addAria', { name: isolate(s.name, 'ltr') })}
                        disabled={!can}
                        testID={`skills-link-pick-${s.name}`}
                    />
                ) : null}
                {s.permissions.length > 0 ? (
                    <Stack gap="xs" accessibilityRole="list">
                        <Text role="label" tone="secondary">{t('settings.skills.link.can')}</Text>
                        {s.permissions.map((p) => (
                            <Text key={p.grant} role="label">
                                {p.text} <Ltr>{p.grant}</Ltr>
                            </Text>
                        ))}
                    </Stack>
                ) : (
                    <Text role="label" tone="secondary">
                        {t(s.permissions_unreadable ? 'settings.skills.link.permissionsUnreadable' : 'settings.skills.link.noPermissions')}
                    </Text>
                )}
                {hasDetails ? (
                    <Disclosure title={t('settings.skills.link.details')} open={open} onToggle={() => setOpen(!open)}>
                        <Stack gap="xs">
                            {why ? <Text role="label">{why}</Text> : null}
                            {codeNote ? <Text role="label">{t(refused ? 'mobileApp.skills.pcBodyCode' : 'settings.skills.link.shipsCode')}</Text> : null}
                            {s.findings.map((f) => <Text key={f} role="label">{f}</Text>)}
                        </Stack>
                    </Disclosure>
                ) : null}
            </Stack>
        </View>
    );
}
