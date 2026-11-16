import { isolateUnit } from '@webui/i18n/registry';

describe('isolateUnit', () => {
    it('keeps a Latin unit left to right', () => {
        expect(isolateUnit('9.7 MB')).toBe('⁦9.7 MB⁩');
    });

    it('lets an Arabic unit read number then unit', () => {
        expect(isolateUnit('1 د')).toBe('⁨1 د⁩');
        expect(isolateUnit('1 د')).not.toContain('⁦');
    });
});
