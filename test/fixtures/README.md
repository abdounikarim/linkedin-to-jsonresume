# Test Fixtures

This directory holds sample "LinkedIn Voyager API response" style JSON files, used by the
test suite (currently `src/main.test.js`) to exercise `buildDbFromLiSchema` and the
`InternalDb` traversal helpers it returns, without needing a live LinkedIn session.

## Fixture format

Every fixture here is shaped like the `LiResponse` type declared in `global.d.ts` at the
repo root:

```ts
interface LiResponse {
    data: {
        $type: LiTypeStr;
        // A ToC-like array of entityUrns, giving the intended display order of `included`
        '*elements'?: string[];
        // Any other key can point (by string URN, or an array of URNs) at entities in `included`
        [k: string]: GenObj | string | boolean;
    };
    included: LiEntity[];
}
```

- `data` is a small "table of contents": most of its keys are either a single URN string
  (pointing at one entity in `included`), or an array of URN strings (pointing at several).
- `included` is a flat array of entities. LinkedIn does **not** guarantee this array's sort
  order matches page/display order - that's what `data['*elements']` (or, less commonly,
  `data['elements']`) is for. `buildDbFromLiSchema` re-sorts `included` to match that array
  before indexing anything (see the comment above that logic in `src/main.js`) - this is a
  subtle, easy-to-regress behavior, which is exactly why it's covered by
  `src/main.test.js`.
- Entities can nest further collections under their own `*elements` (or `elements`) key,
  pointing at other entities in the same flat `included` array. `InternalDb#getValuesByKey`
  knows how to walk one extra level of this (ToC key -> sub-entity -> its `*elements`/`elements`
  -> the actual leaf entities), which is why `mini-profile-response.json` includes a
  `PositionGroup`-style entity for each variant (`*elements` and plain `elements`).

## Fixtures in this directory

- `mini-profile-response.json` - A tiny, fully synthetic profile response with 3 fake
  "Position" entities (out of intentional/scrambled order relative to
  `data['*elements']`), two "PositionGroup"-style wrapper entities (one using `*elements`,
  one using plain `elements`, to cover both sub-collection traversal variants), a
  direct-array ToC key (`directOrderedKeys`), and one bare profile entity. None of the
  names, IDs, or URNs are real - everything is made up for the purpose of the test.

## Capturing new fixtures from a real profile

If you need a fixture that better matches a real-world LinkedIn response shape (e.g. while
debugging a schema change), you can capture one directly from your own profile:

1. Open your own LinkedIn profile in the browser, with this tool's extension/bookmarklet
   loaded.
2. Run it in debug mode (see the main [README's "Debugging Snippets" section](../../README.md#debugging-snippets)
   and [`docs/LinkedIn-Dev-Notes-README.md`](../../docs/LinkedIn-Dev-Notes-README.md) for
   background on the Voyager API shape), e.g.:

   ```js
   var profileRes = await liToJrInstance.getParsedProfile(true);
   var profileDb = await liToJrInstance.internals.buildDbFromLiSchema(profileRes.liResponse);
   // `profileRes.liResponse` is the raw LiResponse - this is what you'd save as a fixture
   copy(JSON.stringify(profileRes.liResponse));
   ```

3. **Before committing anything captured this way**, thoroughly anonymize it: replace your
   name, headline, company names, URNs/IDs, profile pictures, emails, phone numbers, and any
   other personally identifying values with clearly-fake placeholders. Only ever commit
   synthetic-looking data - never your own (or anyone else's) real profile data.
4. Trim the response down to the smallest set of `included` entities needed to reproduce
   the behavior you're testing, and drop unrelated top-level `data` keys.
