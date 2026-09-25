/**
 * Smoke tests for src/utilities.js.
 *
 * These exist to prove the test harness (vitest) is wired up correctly end-to-end -
 * they are intentionally NOT a comprehensive suite. A separate, more thorough suite
 * for utilities.js and the LinkedIn DB-traversal engine in main.js is expected to
 * land separately.
 */
import { describe, expect, it } from 'vitest';
import { zeroLeftPad, parseStartDate, parseEndDate } from '../src/utilities';

describe('zeroLeftPad', () => {
    it('left pads single digit numbers with a zero', () => {
        expect(zeroLeftPad(5)).toBe('05');
    });

    it('does not pad numbers that are already 2+ digits', () => {
        expect(zeroLeftPad(12)).toBe('12');
    });
});

describe('parseStartDate', () => {
    it('formats a full year/month/day date object', () => {
        expect(parseStartDate({ year: 2020, month: 3, day: 15 })).toBe('2020-03-15');
    });

    it('defaults missing month/day to the start of the year', () => {
        expect(parseStartDate({ year: 2020 })).toBe('2020-01-01');
    });

    it('returns an empty string when year is missing', () => {
        expect(parseStartDate({})).toBe('');
    });
});

describe('parseEndDate', () => {
    it('defaults missing month/day to the end of the year', () => {
        expect(parseEndDate({ year: 2020 })).toBe('2020-12-31');
    });
});
