// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ExternalLink } from 'lucide-react';
import { useT } from '../i18n/useT';
import { safeUrlTransform } from '../utils/markdown';
import { CONNECTOR_GUIDES, hasConnectorGuide, showsFieldHint } from '../utils/connectorGuide.core';

export { CONNECTOR_GUIDES, hasConnectorGuide, showsFieldHint };

/** The numbered steps above a connector's form. Its card's own link opens the full guide. */
export function ConnectorGuide({ connectorId, setupUrl }: { connectorId: string; setupUrl?: string | null }) {
    const t = useT();
    const steps = CONNECTOR_GUIDES[connectorId];
    if (!steps) return null;
    return (
        <div className="connector-guide">
            <ol className="setup-steps">
                {steps.map((step, i) => {
                    const href = step.link && (step.link.href === 'setup_url' ? setupUrl : step.link.href);
                    const safe = href ? safeUrlTransform(href) : '';
                    return (
                        <li key={step.title + i} className="setup-step">
                            <span className="setup-step-number" aria-hidden="true"><bdi dir="ltr">{i + 1}</bdi></span>
                            <div className="setup-step-body">
                                <h4 className="settings-label">{t(step.title)}</h4>
                                {step.body && <p className="settings-hint">{t(step.body)}</p>}
                                {step.link && safe && (
                                    <div>
                                        <a className="btn-secondary setup-step-link" href={safe} target="_blank" rel="noopener noreferrer">
                                            {t(step.link.label)}
                                            <ExternalLink size={12} aria-hidden="true" className="setup-step-link-icon" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
