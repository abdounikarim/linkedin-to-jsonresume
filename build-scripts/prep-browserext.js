/**
 * @file Copies (and adjusts) everything needed to load/run the browser extension, for
 * a given target browser, into `./build-browserext`.
 *
 * Usage:
 *   node ./build-scripts/prep-browserext.js
 *   node ./build-scripts/prep-browserext.js --target=firefox
 *   TARGET_BROWSER=firefox node ./build-scripts/prep-browserext.js
 *
 * Defaults to the "chrome" target when none is given, so the existing Chrome-only
 * invocation (`task build:browserext`) keeps working unchanged.
 *
 * All targets share the exact same source in `browser-ext/` (popup.js, background.js,
 * icons, etc). The only thing that varies per-browser is the manifest: each target may
 * have a `manifest.<target>.json` fragment (e.g. `manifest.firefox.json`) that gets
 * shallow-merged on top of the base, Chrome-shaped `manifest.json`.
 */
const path = require('path');
const fse = require('fs-extra');
const packageJson = require('../package.json');
const baseManifest = require('../browser-ext/manifest.json');

const browserExtSrcDir = `${__dirname}/../browser-ext/`;
const buildDir = `${__dirname}/../build/`;
const browserBuildDir = `${__dirname}/../build-browserext/`;
const polyfillSrcFile = require.resolve('webextension-polyfill/dist/browser-polyfill.min.js');

/** @type {Array<'chrome' | 'firefox'>} */
const SUPPORTED_TARGETS = ['chrome', 'firefox'];

/**
 * Manifest override fragments, keyed by target, that get merged on top of the base
 * `manifest.json`. A target with no entry here (e.g. "chrome") just uses the base
 * manifest as-is.
 * @type {Partial<Record<'chrome' | 'firefox', string>>}
 */
const MANIFEST_OVERRIDE_FILES = {
    firefox: `${browserExtSrcDir}manifest.firefox.json`
};

/**
 * Parse `--target=xxx` from argv, falling back to the `TARGET_BROWSER` env var, and
 * then to "chrome".
 * @returns {'chrome' | 'firefox'}
 */
const getTarget = () => {
    // If `--target=xxx` is passed more than once, the last one wins (matches most CLI tools).
    const targetArgMatch = process.argv
        .map((arg) => /^--target=(.+)$/.exec(arg))
        .filter(Boolean)
        .pop();
    const target = (targetArgMatch && targetArgMatch[1]) || process.env.TARGET_BROWSER || 'chrome';
    if (!SUPPORTED_TARGETS.includes(/** @type {'chrome' | 'firefox'} */ (target))) {
        throw new Error(`Unsupported browser target "${target}". Supported targets: ${SUPPORTED_TARGETS.join(', ')}`);
    }
    return /** @type {'chrome' | 'firefox'} */ (target);
};

/**
 * Shallow-merge a manifest override fragment on top of the base manifest. Each
 * top-level key present in `override` fully *replaces* the corresponding key in
 * `base` (this is intentionally not a deep merge - e.g. Firefox's `background` key
 * completely replaces Chrome's `background` key, rather than the two being mixed
 * together). Keys starting with "//" are treated as comments and ignored.
 * @param {GenObj} base
 * @param {GenObj} override
 */
const mergeManifest = (base, override) => {
    const merged = { ...base };
    Object.keys(override).forEach((key) => {
        if (!key.startsWith('//')) {
            merged[key] = override[key];
        }
    });
    return merged;
};

const target = getTarget();

// Clean out build dir
fse.emptyDirSync(browserBuildDir);

// Copy all files from browser extension folder to build, except manifest*.json -
// those are handled explicitly below (merged + version-stamped), so we don't want the
// raw base manifest or any target-specific override fragment to leak into the output.
fse.copySync(browserExtSrcDir, browserBuildDir, {
    filter: (src) => !/^manifest(\..+)?\.json$/.test(path.basename(src))
});

// Build the final manifest: start from the base (Chrome-shaped) manifest, apply any
// target-specific overrides on top, then stamp in the current package version.
let manifest = /** @type {GenObj} */ ({ ...baseManifest });
const overrideFile = MANIFEST_OVERRIDE_FILES[target];
if (overrideFile && fse.existsSync(overrideFile)) {
    manifest = mergeManifest(manifest, fse.readJsonSync(overrideFile));
}
// @ts-ignore
manifest.version = packageJson.version;
fse.writeFileSync(`${browserBuildDir}manifest.json`, JSON.stringify(manifest, null, 4));

// Copy main.js (webpack + babel output) over to the build dir.
fse.copySync(buildDir, browserBuildDir);

// Copy the `webextension-polyfill` UMD bundle in, so `popup.html` (via a <script> tag)
// and `background.js` (via `importScripts()` on Chrome, or a `background.scripts`
// manifest entry on Firefox) can rely on a `browser.*` global that behaves the same
// across Chrome, Firefox, and Edge.
fse.copySync(polyfillSrcFile, `${browserBuildDir}browser-polyfill.min.js`);

console.log(`Prepped browser extension ("${target}" target) in ${browserBuildDir}`);
