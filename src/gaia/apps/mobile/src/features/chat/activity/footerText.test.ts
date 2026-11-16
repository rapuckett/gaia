import { isolateUnit, keepTogether } from '@webui/i18n/registry';

describe('isolateUnit', () => {
    it('keeps a Latin unit left to right', () => {
        expect(isolateUnit('9.7 MB')).toBe('⁦9.7 MB⁩');
    });

    it('lets an Arabic unit read number then unit', () => {
        expect(isolateUnit('1 د')).toBe('⁨1 د⁩');
        expect(isolateUnit('1 د')).not.toContain('⁦');
    });
});

describe('keepTogether', () => {
    it('isolates first-strong and joins the words with no-break spaces', () => {
        expect(keepTogether('Gemma 4 E4B')).toBe('\u2068Gemma\u00A04\u00A0E4B\u2069');
        expect(keepTogether('Gemma 4 E4B')).not.toContain(' ');
    });
});
