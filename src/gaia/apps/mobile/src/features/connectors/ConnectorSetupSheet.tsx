// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { ConnectorRow } from '@/api/client.types';
import { useConfigureConnector } from '@/data';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { isolate } from '@webui/i18n/registry';
import { hasConnectorGuide, showsFieldHint } from '@webui/utils/connectorGuide.core';
import { openLinkFromPress } from '@/platform/openLink';
import { Button, Notice, Sheet, Stack, Text, TextField } from '@/ui';
import { Check, ExternalLink } from '@/ui/icons';

import { canSaveSetup, connectorDescription, fieldHelp, fieldLabel, setupFields, setupPayload, setupProblem, type SetupField, type SetupForm } from './connectorList';
import { ConnectorGuide } from './ConnectorGuide';
import { OAuthClientLine } from './OAuthClientLine';

const SAVED_MS = 2200;
/** Stands in for a secret the PC already holds; the secret itself never comes back. */
const SAVED_SECRET = '••••••••';

/**
 * A connector's setup on the phone: the OAuth client it needs, or an MCP server's keys, sent to the PC.
 * The typed values live only in the form's own state, never in the sheet's props, and are dropped on
 * success and on close.
 */
export function ConnectorSetupSheet({
    connector,
    form,
    onClose,
    onSaved,
}: {
    connector: ConnectorRow;
    form: SetupForm;
    onClose: () => void;
    onSaved: () => void;
}) {
    const t = useT();
    const clear = useRef<(() => void) | null>(null);
    const title =
        form === 'oauthSetup'
            ? t('connectCard.setUp', { name: connector.display_name })
            : form === 'oauthClient'
              ? t('settings.connectors.client')
              : connector.display_name;
    return (
        <Sheet
            open
            onClose={() => {
                clear.current?.();
                onClose();
            }}
            title={title}
        >
            <SetupBody connector={connector} form={form} clearRef={clear} onSaved={onSaved} />
        </Sheet>
    );
}

function SetupBody({
    connector,
    form,
    clearRef,
    onSaved,
}: {
    connector: ConnectorRow;
    form: SetupForm;
    clearRef: MutableRefObject<(() => void) | null>;
    onSaved: () => void;
}) {
    const t = useT();
    const configure = useConfigureConnector();
    const [values, setValues] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [failure, setFailure] = useState<{ text: string; detail?: string } | null>(null);
    const [pcOnly, setPcOnly] = useState(false);

    useEffect(() => {
        clearRef.current = () => setValues({});
        return () => {
            clearRef.current = null;
        };
    }, [clearRef]);

    useEffect(() => {
        if (!saved) return;
        const timer = setTimeout(() => setSaved(false), SAVED_MS);
        return () => clearTimeout(timer);
    }, [saved]);

    async function save() {
        const why = setupProblem(t, connector, form, values);
        setProblem(why);
        if (why) return;
        setBusy(true);
        setFailure(null);
        setPcOnly(false);
        setSaved(false);
        try {
            await configure(connector.id, setupPayload(form, values));
        } catch (error) {
            if (isPcRefusal(error)) setPcOnly(true);
            else setFailure(describeHttpFailure(error, t));
            return;
        } finally {
            setBusy(false);
        }
        setValues({});
        setSaved(true);
        onSaved();
    }

    const client = connector.oauth_client;
    // A server with keys is guided only before it is saved; first-time OAuth setup is guided whenever it shows.
    const guided = hasConnectorGuide(connector.id) && (form === 'oauthSetup' || (form === 'mcp' && !connector.configured));
    const fields = setupFields(connector, form);
    const link = form === 'mcp' ? connector.product_url : connector.docs_url || connector.product_url;
    const saveLabel = saved
        ? t('settings.advanced.saved')
        : form === 'mcp'
          ? t('settings.advanced.save')
          : t('settings.connectors.saveClient');

    function placeholder(field: SetupField): string {
        // A catalog hint is a literal ("xoxb-…"); isolated, it keeps its order in an RTL field.
        const hint = field.placeholder ? isolate(field.placeholder, 'ltr') : '';
        if (form === 'mcp') return connector.configured ? SAVED_SECRET : hint || t.bare('settings.connectors.enterValue');
        return field.kind === 'secret' && client?.source === 'keyring' && client.has_secret ? SAVED_SECRET : hint;
    }

    return (
        <Stack gap="md">
            {form === 'mcp' && connector.description ? (
                <Text role="ui" tone="secondary" testID="connector-setup-description">{connectorDescription(t, connector)}</Text>
            ) : null}
            {form === 'oauthSetup' && !guided ? <Text role="ui" tone="secondary">{t('settings.connectors.firstSetup')}</Text> : null}
            {guided ? <ConnectorGuide connectorId={connector.id} setupUrl={connector.setup_url} /> : null}
            {form === 'oauthClient' ? (
                <Stack gap="xs">
                    <OAuthClientLine connector={connector} emphasis testID="oauth-client-status" />
                    <Text role="label" tone="secondary">{t('settings.connectors.clientHelp')}</Text>
                </Stack>
            ) : null}
            {form === 'mcp' && connector.setup_url && !connector.configured && !guided ? (
                <Stack align="start">
                    <Button
                        size="sm"
                        variant="secondary"
                        wrap
                        label={t('settings.connectors.createApp', { name: connector.display_name })}
                        iconEnd={ExternalLink}
                        onPress={() => openLinkFromPress(connector.setup_url!)}
                    />
                </Stack>
            ) : null}
            {fields.map((field) => (
                <SetupInput
                    key={field.key}
                    label={fieldLabel(t, connector.id, field)}
                    help={field.help_md && (form !== 'mcp' || !connector.configured) && (!guided || showsFieldHint(connector.id, field.key)) ? fieldHelp(t, connector.id, field) : null}
                    secret={form === 'mcp' || field.kind === 'secret'}
                    placeholder={placeholder(field)}
                    value={values[field.key] ?? ''}
                    disabled={busy}
                    onChangeText={(text) => {
                        setSaved(false);
                        setValues((prev) => ({ ...prev, [field.key]: text }));
                    }}
                    testID={`connector-setup-${field.key}`}
                />
            ))}
            {problem ? <Notice tone="danger" message={problem} /> : null}
            {failure ? <Notice tone="danger" message={failure.text} detail={failure.detail} /> : null}
            {pcOnly ? <PcOnlyNotice testID="connector-setup-pc-only" /> : null}
            <Button
                variant="primary"
                full
                wrap
                label={saveLabel}
                icon={saved ? Check : undefined}
                busy={busy}
                disabled={busy || !canSaveSetup(form, values)}
                onPress={() => void save()}
                testID="connector-setup-save"
            />
            {link ? (
                <Stack align="start">
                    <Button
                        size="sm"
                        variant="secondary"
                        label={form === 'mcp' ? t('settings.connectors.docs') : t('settings.connectors.learnMore')}
                        iconEnd={ExternalLink}
                        onPress={() => openLinkFromPress(link)}
                    />
                </Stack>
            ) : null}
        </Stack>
    );
}

/** One setup value. A secret is masked with no reveal; nothing typed here is suggested, autofilled or offered to a password manager. */
function SetupInput({
    label,
    help,
    secret,
    placeholder,
    value,
    disabled,
    onChangeText,
    testID,
}: {
    label: string;
    help: string | null;
    secret: boolean;
    placeholder: string;
    value: string;
    disabled: boolean;
    onChangeText: (text: string) => void;
    testID: string;
}) {
    return (
        <Stack gap="xs">
            <TextField
                label={label}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                disabled={disabled}
                secret={secret}
                literal={!secret}
                testID={testID}
            />
            {help ? <Text role="label" tone="secondary">{help}</Text> : null}
        </Stack>
    );
}
