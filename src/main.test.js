import { describe, it, expect, beforeEach } from 'vitest';
// Importing this triggers the top-level `window.LinkedinToResumeJson = (() => {...})()`
// assignment. `main.js` reads `document`/`window` at construction time (not at import
// time), so this requires a DOM environment - see `environment: 'jsdom'` in
// vitest.config.mjs.
import './main.js';
import miniProfileFixture from '../test/fixtures/mini-profile-response.json';

/**
 * `buildDbFromLiSchema` is a private function defined inside the `main.js` IIFE - it's not
 * directly exported/importable. The only supported way to reach it from outside is via the
 * `debug: true` escape hatch on the constructor, which stashes a handful of internals
 * (see `this.internals = {...}` in the `LinkedinToResumeJson` constructor, and the
 * "Debugging Snippets" section of the main README).
 * @returns {(schemaJson: LiResponse) => InternalDb}
 */
function getBuildDbFromLiSchema() {
    // @ts-ignore - assigned onto `window` by src/main.js
    const instance = new window.LinkedinToResumeJson(true);
    expect(instance.debug).toBe(true);
    expect(typeof instance.internals.buildDbFromLiSchema).toBe('function');
    return instance.internals.buildDbFromLiSchema;
}

/**
 * `buildDbFromLiSchema` mutates its input (it re-sorts `schemaJson.included` in place, and
 * deletes `data.included`), so every test gets its own deep clone of the fixture to avoid
 * cross-test pollution.
 * @returns {LiResponse}
 */
function cloneFixture() {
    return JSON.parse(JSON.stringify(miniProfileFixture));
}

describe('buildDbFromLiSchema', () => {
    /** @type {(schemaJson: LiResponse) => InternalDb} */
    let buildDbFromLiSchema;

    beforeEach(() => {
        buildDbFromLiSchema = getBuildDbFromLiSchema();
    });

    it('reorders `included` to match the `data["*elements"]` ordering, appending leftovers last', () => {
        const db = buildDbFromLiSchema(cloneFixture());
        // Fixture's `data["*elements"]` is: [position:2, position:1, position:3]
        // Fixture's raw `included` array order (before reorder) is: [groupA, position:1, position:3, position:2, groupB, profile]
        // Expected order after reorder: elements array order first, then remaining entities in their original relative order
        expect(db.entities.map((e) => e.entityUrn)).toEqual([
            'urn:li:fsd_position:2',
            'urn:li:fsd_position:1',
            'urn:li:fsd_position:3',
            'urn:li:fsd_profilePositionGroup:groupA',
            'urn:li:fsd_profilePositionGroup:groupB',
            'urn:li:fsd_profile:testProfile123'
        ]);
    });

    it('attaches a `key` property (equal to entityUrn) to each entity', () => {
        const db = buildDbFromLiSchema(cloneFixture());
        db.entities.forEach((e) => {
            expect(e.key).toBe(e.entityUrn);
        });
    });

    it('strips `included` off of the tableOfContents (tableOfContents === original data, minus `included`)', () => {
        const db = buildDbFromLiSchema(cloneFixture());
        expect(db.tableOfContents.included).toBeUndefined();
        expect(db.tableOfContents.positionGroup).toBe('urn:li:fsd_profilePositionGroup:groupA');
    });

    describe('db.getElementByUrn', () => {
        it('returns the matching entity for a known URN', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const entity = db.getElementByUrn('urn:li:fsd_position:1');
            expect(entity).toBeDefined();
            expect(entity.title).toBe('Software Engineer');
        });

        it('returns undefined for an unknown URN', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            expect(db.getElementByUrn('urn:li:fsd_position:does-not-exist')).toBeUndefined();
        });
    });

    describe('db.getElementsByUrns', () => {
        it('returns entities for an array of URNs, in the requested order', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const entities = db.getElementsByUrns(['urn:li:fsd_position:3', 'urn:li:fsd_position:1']);
            expect(entities.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:3', 'urn:li:fsd_position:1']);
        });

        it('accepts a single URN string for convenience', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const entities = db.getElementsByUrns('urn:li:fsd_position:1');
            expect(entities.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:1']);
        });
    });

    describe('db.getElementsByType', () => {
        it('returns all entities matching a single $type string', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const positions = db.getElementsByType('com.linkedin.voyager.dash.identity.profile.Position');
            expect(positions).toHaveLength(3);
            expect(positions.map((e) => e.entityUrn).sort()).toEqual(['urn:li:fsd_position:1', 'urn:li:fsd_position:2', 'urn:li:fsd_position:3'].sort());
        });

        it('returns all entities matching any of an array of $type strings', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const matches = db.getElementsByType(['com.linkedin.voyager.dash.identity.profile.Position', 'com.linkedin.voyager.dash.identity.profile.PositionGroup']);
            expect(matches).toHaveLength(5);
        });

        it('returns an empty array when no entities match', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            expect(db.getElementsByType('com.linkedin.does.not.Exist')).toEqual([]);
        });
    });

    describe('db.getValueByKey', () => {
        it('resolves a ToC key to its single pointed-at entity', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const value = db.getValueByKey('positionGroup');
            expect(value.entityUrn).toBe('urn:li:fsd_profilePositionGroup:groupA');
        });

        it('returns the first match when given an array of keys, skipping unresolvable ones', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const value = db.getValueByKey(['keyThatDoesNotExist', 'positionGroup']);
            expect(value.entityUrn).toBe('urn:li:fsd_profilePositionGroup:groupA');
        });

        it('returns undefined when no key resolves to anything', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            expect(db.getValueByKey('keyThatDoesNotExist')).toBeUndefined();
        });
    });

    describe('db.getValuesByKey (multi-level traversal)', () => {
        it('traverses one level through a sub-entity using its `*elements` list', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey('positionGroup');
            expect(values.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:1', 'urn:li:fsd_position:2']);
        });

        it('traverses one level through a sub-entity using its plain `elements` list', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey('positionGroupNoStarElements');
            expect(values.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:3', 'urn:li:fsd_position:2']);
        });

        it('uses a direct array-of-URNs ToC value as-is, without needing a sub-entity lookup', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey('directOrderedKeys');
            expect(values.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:3', 'urn:li:fsd_position:1']);
        });

        it('returns the sub-entity itself when it has no `*elements`/`elements` sub-collection', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey('mainProfile');
            expect(values).toHaveLength(1);
            expect(values[0].entityUrn).toBe('urn:li:fsd_profile:testProfile123');
        });

        it('concatenates results when given an array of keys', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey(['positionGroup', 'positionGroupNoStarElements']);
            expect(values.map((e) => e.entityUrn)).toEqual(['urn:li:fsd_position:1', 'urn:li:fsd_position:2', 'urn:li:fsd_position:3', 'urn:li:fsd_position:2']);
        });

        it('applies an optional tocValModifier to override the raw ToC value before resolving', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            const values = db.getValuesByKey('keyThatDoesNotExist', () => 'urn:li:fsd_profile:testProfile123');
            expect(values).toHaveLength(1);
            expect(values[0].entityUrn).toBe('urn:li:fsd_profile:testProfile123');
        });

        it('returns an empty array when the key does not resolve to anything', () => {
            const db = buildDbFromLiSchema(cloneFixture());
            expect(db.getValuesByKey('keyThatDoesNotExist')).toEqual([]);
        });
    });
});
