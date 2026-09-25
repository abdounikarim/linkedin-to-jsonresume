import { describe, it, expect } from 'vitest';
import {
    maxDaysOfMonth,
    zeroLeftPad,
    parseStartDate,
    parseEndDate,
    liDateToJSDate,
    noNullOrUndef,
    lazyCopy,
    remapNestedLocale,
    setQueryParams,
    companyLiPageFromCompanyUrn,
    parseAndAttachResumeDates
} from './utilities';

describe('zeroLeftPad', () => {
    it('pads single digit numbers with a leading zero', () => {
        expect(zeroLeftPad(0)).toBe('00');
        expect(zeroLeftPad(1)).toBe('01');
        expect(zeroLeftPad(9)).toBe('09');
    });

    it('leaves two (or more) digit numbers untouched (as a string)', () => {
        expect(zeroLeftPad(10)).toBe('10');
        expect(zeroLeftPad(12)).toBe('12');
        expect(zeroLeftPad(100)).toBe('100');
    });
});

describe('parseStartDate / parseEndDate (parseDate)', () => {
    it('returns an empty string when year is missing/undefined', () => {
        expect(parseStartDate(undefined)).toBe('');
        expect(parseStartDate({})).toBe('');
        expect(parseEndDate(undefined)).toBe('');
        expect(parseEndDate({})).toBe('');
    });

    it('formats a full year/month/day object as-is', () => {
        expect(parseStartDate({ year: 2020, month: 6, day: 15 })).toBe('2020-06-15');
        expect(parseEndDate({ year: 2020, month: 6, day: 15 })).toBe('2020-06-15');
    });

    it('defaults month=1 and day=1 for a year-only start date', () => {
        expect(parseStartDate({ year: 2018 })).toBe('2018-01-01');
    });

    it('defaults month=12 and day=last-day-of-month for a year-only end date', () => {
        expect(parseEndDate({ year: 2018 })).toBe('2018-12-31');
    });

    it('defaults day=1 for a start date with year+month but no day', () => {
        expect(parseStartDate({ year: 2021, month: 3 })).toBe('2021-03-01');
    });

    it('defaults day=last-day-of-that-month for an end date with year+month but no day', () => {
        expect(parseEndDate({ year: 2021, month: 4 })).toBe('2021-04-30');
        // January -> 31
        expect(parseEndDate({ year: 2021, month: 1 })).toBe('2021-01-31');
    });

    it('uses day 28 for February end-of-month, regardless of leap year (known limitation)', () => {
        // NOTE: `maxDaysOfMonth` is a static lookup table (src/utilities.js) with no leap-year
        // awareness, so Feb is always treated as having 28 days. 2020 and 2024 were leap years
        // (Feb had 29 days) but this util will still report the 28th as the end date. This is
        // a known, accepted limitation - fixing it is out of scope for this test suite.
        expect(parseEndDate({ year: 2020, month: 2 })).toBe('2020-02-28');
        expect(parseEndDate({ year: 2024, month: 2 })).toBe('2024-02-28');
        expect(parseEndDate({ year: 2021, month: 2 })).toBe('2021-02-28');
    });

    it('exposes correct maxDaysOfMonth values for every month (except the known Feb limitation)', () => {
        expect(maxDaysOfMonth).toEqual({
            1: 31,
            2: 28,
            3: 31,
            4: 30,
            5: 31,
            6: 30,
            7: 31,
            8: 31,
            9: 30,
            10: 31,
            11: 30,
            12: 31
        });
    });
});

describe('liDateToJSDate', () => {
    it('produces a Date in local time (not UTC-shifted) matching year/month/day', () => {
        const jsDate = liDateToJSDate({ year: 2019, month: 7, day: 4 });
        expect(jsDate).toBeInstanceOf(Date);
        expect(jsDate.getFullYear()).toBe(2019);
        // LiDate month is 1-indexed; JS Date#getMonth() is 0-indexed
        expect(jsDate.getMonth()).toBe(6);
        expect(jsDate.getDate()).toBe(4);
        // Confirms local-time parsing: hours should be midnight local, not shifted by timezone offset
        expect(jsDate.getHours()).toBe(0);
        expect(jsDate.getMinutes()).toBe(0);
    });

    it('defaults to day 1 / month 1 (start-of-year) when only year is given', () => {
        const jsDate = liDateToJSDate({ year: 2000 });
        expect(jsDate.getFullYear()).toBe(2000);
        expect(jsDate.getMonth()).toBe(0);
        expect(jsDate.getDate()).toBe(1);
    });
});

describe('noNullOrUndef', () => {
    it('replaces null with the default value', () => {
        expect(noNullOrUndef(null, 'fallback')).toBe('fallback');
    });

    it('replaces undefined with the default value', () => {
        expect(noNullOrUndef(undefined, 'fallback')).toBe('fallback');
    });

    it('defaults to an empty string when no default is provided', () => {
        expect(noNullOrUndef(null)).toBe('');
        expect(noNullOrUndef(undefined)).toBe('');
    });

    it('passes other falsy values through unchanged', () => {
        expect(noNullOrUndef(0, 'fallback')).toBe(0);
        expect(noNullOrUndef(false, 'fallback')).toBe(false);
        expect(noNullOrUndef('', 'fallback')).toBe('');
        expect(noNullOrUndef(NaN, 'fallback')).toBeNaN();
    });

    it('passes truthy values through unchanged', () => {
        expect(noNullOrUndef('hello', 'fallback')).toBe('hello');
        expect(noNullOrUndef(42, 'fallback')).toBe(42);
    });
});

describe('lazyCopy', () => {
    it('deep copies an object (not a reference)', () => {
        const input = { a: 1, nested: { b: 2 } };
        const copy = lazyCopy(input);
        expect(copy).toEqual(input);
        expect(copy).not.toBe(input);
        expect(copy.nested).not.toBe(input.nested);
    });

    it('removes specified top-level keys from the copy', () => {
        const input = { keep: 1, dropMe: 2, alsoDropMe: 3 };
        const copy = lazyCopy(input, ['dropMe', 'alsoDropMe']);
        expect(copy).toEqual({ keep: 1 });
    });

    it('does not mutate the input object', () => {
        const input = { keep: 1, dropMe: 2, nested: { c: 3 } };
        const inputSnapshot = JSON.parse(JSON.stringify(input));
        lazyCopy(input, ['dropMe']);
        expect(input).toEqual(inputSnapshot);
    });
});

describe('remapNestedLocale', () => {
    it('hoists the desired locale value from a multiLocale wrapper to the top-level field (JSDoc example)', () => {
        const input = {
            firstName: 'Алексе́й',
            multiLocaleFirstName: {
                ru_RU: 'Алексе́й',
                en_US: 'Alexey'
            }
        };
        remapNestedLocale(input, 'en_US');
        expect(input.firstName).toBe('Alexey');
    });

    it('works across an array of objects', () => {
        const input = [
            {
                firstName: 'Алексе́й',
                multiLocaleFirstName: { ru_RU: 'Алексе́й', en_US: 'Alexey' }
            },
            {
                firstName: 'Мария',
                multiLocaleFirstName: { ru_RU: 'Мария', en_US: 'Maria' }
            }
        ];
        remapNestedLocale(input, 'en_US');
        expect(input[0].firstName).toBe('Alexey');
        expect(input[1].firstName).toBe('Maria');
    });

    it('recurses into nested objects when deep=true (default)', () => {
        const input = {
            position: {
                companyName: 'Old Co',
                multiLocaleCompanyName: {
                    ru_RU: 'Старая Компания',
                    en_US: 'New Co Name'
                }
            }
        };
        remapNestedLocale(input, 'en_US', true);
        expect(input.position.companyName).toBe('New Co Name');
    });

    it('does not recurse into nested objects when deep=false', () => {
        const input = {
            position: {
                companyName: 'Old Co',
                multiLocaleCompanyName: {
                    ru_RU: 'Старая Компания',
                    en_US: 'New Co Name'
                }
            }
        };
        remapNestedLocale(input, 'en_US', false);
        expect(input.position.companyName).toBe('Old Co');
    });

    it('leaves the original field untouched when the desired locale key does not exist in the map', () => {
        const input = {
            firstName: 'Алексе́й',
            multiLocaleFirstName: {
                ru_RU: 'Алексе́й'
            }
        };
        remapNestedLocale(input, 'fr_FR');
        expect(input.firstName).toBe('Алексе́й');
    });
});

describe('setQueryParams', () => {
    it('adds new params to a URL with no existing query string', () => {
        const result = setQueryParams('https://example.com/path', { foo: 'bar' });
        expect(result).toBe('https://example.com/path?foo=bar');
    });

    it('merges new params with existing querystring params', () => {
        const result = setQueryParams('https://example.com/path?existing=1', { foo: 'bar' });
        const url = new URL(result);
        expect(url.searchParams.get('existing')).toBe('1');
        expect(url.searchParams.get('foo')).toBe('bar');
    });

    it('preserves existing params that are not present in the new param set', () => {
        const result = setQueryParams('https://example.com/path?a=1&b=2', { c: '3' });
        const url = new URL(result);
        expect(url.searchParams.get('a')).toBe('1');
        expect(url.searchParams.get('b')).toBe('2');
        expect(url.searchParams.get('c')).toBe('3');
    });

    it('overwrites existing params that ARE present in the new param set', () => {
        const result = setQueryParams('https://example.com/path?a=1&b=2', { b: 'overwritten' });
        const url = new URL(result);
        expect(url.searchParams.get('a')).toBe('1');
        expect(url.searchParams.get('b')).toBe('overwritten');
    });
});

describe('companyLiPageFromCompanyUrn', () => {
    it('returns company.url when the URN resolves via the Dash-entity path', () => {
        const fakeDb = {
            entitiesByUrn: {
                'urn:li:fsd_company:12345': {
                    entityUrn: 'urn:li:fsd_company:12345',
                    url: 'https://www.linkedin.com/company/some-dash-company/'
                }
            },
            getElementByUrn(urn) {
                return this.entitiesByUrn[urn];
            }
        };
        const result = companyLiPageFromCompanyUrn('urn:li:fsd_company:12345', fakeDb);
        expect(result).toBe('https://www.linkedin.com/company/some-dash-company/');
    });

    it('extracts a company page URL via the profileView URN regex when no Dash entity is found', () => {
        const fakeDb = {
            entitiesByUrn: {},
            getElementByUrn() {
                return undefined;
            }
        };
        const urn = 'urn:li:fs_miniCompany:Company:12345';
        const result = companyLiPageFromCompanyUrn(urn, fakeDb);
        expect(result).toBe('https://www.linkedin.com/company/12345');
    });

    it('returns an empty string when the URN does not match anything', () => {
        const fakeDb = {
            entitiesByUrn: {},
            getElementByUrn() {
                return undefined;
            }
        };
        const result = companyLiPageFromCompanyUrn('urn:li:something:unrelated', fakeDb);
        expect(result).toBe('');
    });

    it('returns an empty string when companyUrn is not a string', () => {
        const fakeDb = {
            entitiesByUrn: {},
            getElementByUrn() {
                return undefined;
            }
        };
        // @ts-expect-error - deliberately passing a non-string to exercise the guard
        expect(companyLiPageFromCompanyUrn(undefined, fakeDb)).toBe('');
    });
});

describe('parseAndAttachResumeDates', () => {
    it('handles the `timePeriod` / `startDate` / `endDate` key variant', () => {
        const resumeObj = {};
        const liEntity = {
            timePeriod: {
                startDate: { year: 2015, month: 1, day: 1 },
                endDate: { year: 2018, month: 6, day: 30 }
            }
        };
        parseAndAttachResumeDates(resumeObj, liEntity);
        expect(resumeObj.startDate).toBe('2015-01-01');
        expect(resumeObj.endDate).toBe('2018-06-30');
    });

    it('handles the `dateRange` / `start` / `end` key variant', () => {
        const resumeObj = {};
        const liEntity = {
            dateRange: {
                start: { year: 2010 },
                end: { year: 2012 }
            }
        };
        parseAndAttachResumeDates(resumeObj, liEntity);
        expect(resumeObj.startDate).toBe('2010-01-01');
        expect(resumeObj.endDate).toBe('2012-12-31');
    });

    it('mutates the passed-in resumeObj in place (and returns undefined)', () => {
        const resumeObj = { existingField: 'keep-me' };
        const liEntity = {
            timePeriod: {
                startDate: { year: 2022 }
            }
        };
        const returnVal = parseAndAttachResumeDates(resumeObj, liEntity);
        expect(returnVal).toBeUndefined();
        expect(resumeObj.existingField).toBe('keep-me');
        expect(resumeObj.startDate).toBe('2022-01-01');
    });

    it('does nothing when neither timePeriod nor dateRange is present', () => {
        const resumeObj = { untouched: true };
        parseAndAttachResumeDates(resumeObj, {});
        expect(resumeObj).toEqual({ untouched: true });
    });

    it('only sets endDate when only an end is present, and vice versa', () => {
        const resumeObjEndOnly = {};
        parseAndAttachResumeDates(resumeObjEndOnly, { timePeriod: { endDate: { year: 2020 } } });
        expect(resumeObjEndOnly.endDate).toBe('2020-12-31');
        expect(resumeObjEndOnly.startDate).toBeUndefined();

        const resumeObjStartOnly = {};
        parseAndAttachResumeDates(resumeObjStartOnly, { timePeriod: { startDate: { year: 2020 } } });
        expect(resumeObjStartOnly.startDate).toBe('2020-01-01');
        expect(resumeObjStartOnly.endDate).toBeUndefined();
    });
});
