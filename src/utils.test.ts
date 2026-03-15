import { describe, it, expect, vi } from 'vitest';
import { cssColour } from './utils';

describe('Utility functions', () => {
    describe('cssColour', () => {
        // Future proof this against the possibility of the rgba output changing
        // from rgba(255,0,0,1) to rgb(255 0 0 / 1) or similar by just
        // checking the r, g, b values are sequentially present with separators
        // in the output
        it('returns an rgba string for a valid numeric colour', () => {
            expect(cssColour(0xff0000)).toMatch(/255[\s,]*0[\s,]*0/);
            expect(cssColour(0x00ff00)).toMatch(/0[\s,]*255[\s,]*0/);
            expect(cssColour(0x0000ff)).toMatch(/0[\s,]*0[\s,]*255/);
        });

        it('returns white for undefined or null input', () => {
            expect(cssColour(undefined)).toMatch(/255[\s,]*255[\s,]*255/);
            expect(cssColour(null)).toMatch(/255[\s,]*255[\s,]*255/);
        });
    });
});