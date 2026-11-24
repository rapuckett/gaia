// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaAuthError, GaiaNetworkError, GaiaTurnError } from '@/api/errors';

import { describeDetail, describeError, describeErrorWith, describeHttpFailure, serverText, technicalDetail, translator } from './useT';

describe('nested error messages', () => {
    const error = new GaiaNetworkError('http://127.0.0.1:4210/api/setup/check', new Error('fetch failed'));

    it('brackets an Arabic error once, each half in its own language, with no URL or raw cause', () => {
        const t = translator('ar');
        const text = t.compose((say) => say('setup.unknown.failed', { error: describeErrorWith(error, say) }));
        expect(text.split('(').length - 1).toBe(1);
        expect(text.slice(text.indexOf('(')).match(/[\u0600-\u06FF]/)).toBeNull();
        expect(text).not.toContain('127.0.0.1');
        expect(text).not.toContain('fetch failed');
        expect(technicalDetail(error)).toContain('fetch failed');
    });
});

describe('server text stays out of the sentence', () => {
    it.each(['en', 'ar'])('a PC HTTP error in %s gives a reason-free title and the raw text as detail', (code) => {
        const { text, detail } = describeHttpFailure(new GaiaApiError(500, 'The connectors service is not running.'), translator(code));
        expect(detail).toBe('The connectors service is not running.');
        expect(text).not.toContain('connectors service');
        expect(text).not.toMatch(/500/);
        expect(text).toBe(translator(code)('mobileApp.error.httpNoDetail'));
        if (code === 'en') expect(text).toBe("Something went wrong on your PC.");
    });

    it.each(['en', 'ar'])('a failed turn in %s gives a reason-free sentence and the PC text as detail', (code) => {
        const t = translator(code);
        const { text, detail } = describeHttpFailure(new GaiaTurnError('llama-server exited with code 3'), t);
        expect(detail).toBe('llama-server exited with code 3');
        expect(text).not.toContain('llama-server');
        expect(text).toBe(t('mobileApp.error.turnFailedNoDetail'));
    });

    it('a failed turn with no detail is the sentence alone', () => {
        const t = translator('en');
        expect(describeHttpFailure(new GaiaTurnError(''), t)).toEqual({ text: t('mobileApp.error.turnFailedNoDetail') });
    });

    it.each(['en', 'ar'])('a pairing refusal in %s gives the reason-free sentence and the PC text as detail', (code) => {
        const t = translator(code);
        const { text, detail } = describeHttpFailure(new GaiaAuthError('token revoked by the PC'), t);
        expect(detail).toBe('token revoked by the PC');
        expect(text).toBe(t('mobileApp.error.authNoDetail'));
        expect(text).not.toContain('revoked');
    });

    it('a pairing refusal with no detail is the sentence alone', () => {
        const t = translator('en');
        const result = describeHttpFailure(new GaiaAuthError(''), t);
        expect(result.detail).toBeUndefined();
        expect(result.text).toBe(t('mobileApp.error.authNoDetail'));
    });

    it('serverText is the raw text only for errors we did not write', () => {
        expect(serverText(new Error('The download was interrupted.'))).toBe('The download was interrupted.');
        expect(serverText(new GaiaNetworkError('http://x/api', new Error('boom')))).toBeUndefined();
    });

    it('the Technical details line is the raw status and text, with no translated words around it', () => {
        expect(technicalDetail(new GaiaApiError(500, 'Connection refused'))).toBe('500 Connection refused');
    });
});

describe('a PC HTTP error never puts its status or text in a sentence', () => {
    const error = new GaiaApiError(502, 'Bad gateway from the model server.');

    it.each(['en', 'ar'])('describeError in %s is the reason-free title', (code) => {
        const t = translator(code);
        const text = describeError(error, t);
        expect(text).toBe(t('mobileApp.error.httpNoDetail'));
        expect(text).not.toMatch(/502|gateway/);
    });

    it.each(['en', 'ar'])('describeErrorWith in %s fills a {reason} slot with the title alone', (code) => {
        const t = translator(code);
        const text = t.compose((say) => say('setup.unknown.failed', { error: describeErrorWith(error, say) }));
        expect(text).not.toMatch(/502|gateway/);
        expect(text).toContain(code === 'en' ? 'Something went wrong on your PC.' : 'حدث خطأ في الكمبيوتر لديك.');
    });

    it('a PC error with no text still reads as the title, with no status', () => {
        const t = translator('en');
        expect(describeError(new GaiaApiError(500, ''), t)).toBe("Something went wrong on your PC.");
    });

    it('describeDetail is the PC text for a Details line, our wording when there is none, and never the status', () => {
        const t = translator('en');
        expect(describeDetail(error, t)).toBe('Bad gateway from the model server.');
        expect(describeDetail(new GaiaApiError(500, ''), t)).toBe("Something went wrong on your PC.");
        expect(describeDetail(new GaiaNetworkError('http://x/api', new Error('boom')), t)).toBe(describeError(new GaiaNetworkError('http://x/api', new Error('boom')), t));
    });
});
