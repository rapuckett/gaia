// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Which replies are connector sign-in errors, and whether the account they name is connected now. Pure, so the phone app can import it. */

import type { ConnectorListEntry } from '../types';
import { signInFixed } from './connectorAccounts';

/** Match the canonical prefixes the connectors framework emits. The
 *  prefixes are stable (see ``connectors/formatting.py``); fuzzy
 *  fallbacks handle agent-specific override messages.
 */
export function isAuthRequiredMessage(content: string): boolean {
    if (!content) return false;
    if (content.includes('NOT_CONNECTED:')) return true;
    if (content.includes('AGENT_NOT_GRANTED:')) return true;
    if (content.includes('AUTH_REQUIRED:')) return true;
    // Agent-specific override (``_AGENT_GRANT_MIGRATION_MESSAGES`` for
    // installed:email). Lowercased substring check so wording tweaks
    // upstream don't silently break the detection.
    const lower = content.toLowerCase();
    if (
        lower.includes('connectors → google') ||
        lower.includes('connections → google') ||
        lower.includes('email agent needs additional google permissions')
    ) {
        return true;
    }
    // Microsoft-side error messages from format_connector_error. Each
    // connector id needs its own phrase check below — "microsoft_work is not
    // currently connected" does NOT contain "microsoft is not currently
    // connected" as a substring.
    if (
        lower.includes('connectors → microsoft') ||
        lower.includes('connections → microsoft') ||
        lower.includes('microsoft is not currently connected') ||
        lower.includes('microsoft_work is not currently connected')
    ) {
        return true;
    }
    return false;
}

/** The three mailbox connectors the email agent can grant-check (#2629):
 *  ``google`` (Gmail), ``microsoft`` (personal Outlook), and
 *  ``microsoft_work`` (work Microsoft 365 / Entra). */
export type EmailProvider = 'google' | 'microsoft' | 'microsoft_work';

/**
 * Detect which provider(s) an error message references.
 *
 * Returns:
 * - ``'google'``         — only Google connector mentioned
 * - ``'microsoft'``      — only the personal Outlook connector mentioned
 * - ``'microsoft_work'`` — only the work Microsoft 365 connector mentioned
 * - ``'all'``            — ambiguous / no specific provider found → show all three
 *
 * The work connector must be checked BEFORE the generic Microsoft check:
 * ``format_connector_error`` embeds the literal connector id, and
 * "microsoft_work" contains "microsoft" as a substring, so checking in the
 * wrong order would always classify a work-mailbox error as personal.
 */
export function detectProvider(content: string): EmailProvider | 'all' {
    if (!content) return 'all';
    const lower = content.toLowerCase();
    const mentionsGoogle = lower.includes('google') || lower.includes('gmail');
    const mentionsWork =
        lower.includes('microsoft_work') ||
        lower.includes('microsoft 365') ||
        lower.includes('office365') ||
        lower.includes('o365');
    const mentionsPersonal =
        !mentionsWork && (lower.includes('microsoft') || lower.includes('outlook'));

    const hits = [mentionsGoogle, mentionsPersonal, mentionsWork].filter(Boolean).length;
    if (hits !== 1) return 'all';
    if (mentionsGoogle) return 'google';
    if (mentionsWork) return 'microsoft_work';
    return 'microsoft';
}

/** Whether each provider's sign-in has happened since `before`; `accounts` names the account a card offered. */
function fixedIn(connectors: ConnectorListEntry[], before: ConnectorListEntry[], accounts: Record<string, string>) {
    return (id: string) => signInFixed(
        connectors.find((c) => c.id === id),
        before.find((c) => c.id === id),
        accounts[id],
    );
}

/**
 * Given the error message and the current connector rows, decide whether the
 * provider the message referenced is now connected. Pure + exported for tests.
 * `before` is the list as the reply first saw it and `accounts` names the
 * account its card offered to sign in to again, so one working account among
 * several never counts as the fix for another.
 *
 * ``detectProvider`` returns 'google' | 'microsoft' | 'microsoft_work' | 'all'
 * (ambiguous). For an ambiguous message, any of the three connecting is
 * enough to retry.
 */
export function referencedProviderConnected(
    content: string,
    connectors: ConnectorListEntry[],
    providers: string[] = [],
    before: ConnectorListEntry[] = [],
    accounts: Record<string, string> = {},
): boolean {
    const isFixed = fixedIn(connectors, before, accounts);
    // A Connect card names its connectors outright; no wording to read.
    if (providers.length > 0) return providers.some(isFixed);
    const provider = detectProvider(content);
    if (provider === 'google') return isFixed('google');
    if (provider === 'microsoft') return isFixed('microsoft');
    if (provider === 'microsoft_work') return isFixed('microsoft_work');
    return isFixed('google') || isFixed('microsoft') || isFixed('microsoft_work');
}

/**
 * Human label for the connected provider, for the banner copy. An ambiguous
 * message resolves to whichever provider is actually fixed, preferring
 * Google, then Microsoft, then Microsoft 365 (the connectors' canonical
 * display order).
 */
export function connectedProviderLabel(
    content: string,
    connectors: ConnectorListEntry[],
    providers: string[] = [],
    before: ConnectorListEntry[] = [],
    accounts: Record<string, string> = {},
): string {
    const isFixed = fixedIn(connectors, before, accounts);
    const named = providers.find(isFixed);
    if (named) {
        const row = connectors.find((c) => c.id === named && !('error' in c));
        return row && !('error' in row) ? row.display_name : named;
    }
    const provider = detectProvider(content);
    if (provider === 'google') return 'Google';
    if (provider === 'microsoft') return 'Microsoft';
    if (provider === 'microsoft_work') return 'Microsoft 365';
    if (isFixed('google')) return 'Google';
    if (isFixed('microsoft')) return 'Microsoft';
    if (isFixed('microsoft_work')) return 'Microsoft 365';
    return 'Google';
}
