import { describe, expect, it } from 'vitest';
import { resolveUniCalColor, UNI_CAL_DEFAULT_COLOR } from './uniCalColor';

describe('resolveUniCalColor', () => {
    it('uses the uni_cal color', () => {
        expect(
            resolveUniCalColor({
                uni_cal_global: { color_id: '#0b8043' },
                uni_cal_categories: { holiday: { color_id: '#d50000' } }
            })
        ).toBe('#0b8043');
    });

    it('falls back to a category color when the uni_cal row has no color', () => {
        expect(
            resolveUniCalColor({
                uni_cal_global: { color_id: null },
                uni_cal_categories: { holiday: { color_id: '#d50000' } }
            })
        ).toBe('#d50000');
    });

    it('reads a legacy Google color id', () => {
        expect(resolveUniCalColor({ uni_cal_global: { color_id: 7 } })).toBe('#039be5');
    });

    it('uses the default color when the user saved no color', () => {
        expect(resolveUniCalColor({ uni_cal_global: null, uni_cal_categories: {} })).toBe(UNI_CAL_DEFAULT_COLOR);
    });

    it('uses the default color for a value it cannot read', () => {
        expect(resolveUniCalColor({ uni_cal_global: { color_id: '99' } })).toBe(UNI_CAL_DEFAULT_COLOR);
    });
});
