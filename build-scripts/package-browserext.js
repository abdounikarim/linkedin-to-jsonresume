/**
 * @file Creates a ZIP file that contains everything necessary to publish as a browser extension
 * (e.g. publish to the Chrome webstore, or side-load / submit to addons.mozilla.org).
 *
 * Usage:
 *   node ./build-scripts/package-browserext.js
 *   node ./build-scripts/package-browserext.js --target=firefox
 *   TARGET_BROWSER=firefox node ./build-scripts/package-browserext.js
 *
 * NOTE: This only zips up `./build-browserext` - it does not itself run the prep step.
 * Make sure `./build-browserext` was already prepped for the same target (`task
 * build:browserext -- --target=firefox`) before packaging for that target.
 */
const fse = require('fs-extra');
const archiver = require('archiver');

// Get version info
const versionString = require('../package.json').version.toString();

/**
 * Parse `--target=xxx` from argv, falling back to the `TARGET_BROWSER` env var, and
 * then to "chrome". Only affects the output ZIP's filename.
 */
const targetArgMatch = process.argv
    .map((arg) => /^--target=(.+)$/.exec(arg))
    .filter(Boolean)
    .pop();
const target = (targetArgMatch && targetArgMatch[1]) || process.env.TARGET_BROWSER || 'chrome';

// Keep the default (Chrome) filename unchanged for backwards compatibility; only
// suffix the filename for non-default targets.
const zipFileName = target === 'chrome' ? `build_${versionString}.zip` : `build_${versionString}_${target}.zip`;

fse.ensureDirSync(`${__dirname}/../webstore-zips`);
const output = fse.createWriteStream(`${__dirname}/../webstore-zips/${zipFileName}`);
const archive = archiver('zip', {
    zlib: { level: 6 } // compression level
});

// listen for all archive data to be written
output.on('close', () => {
    console.log(`${archive.pointer()} total bytes`);
    console.log(`archiver has been finalized and the output file descriptor has closed (${zipFileName}).`);
});

// good practice to catch this error explicitly
archive.on('error', (err) => {
    throw err;
});

// pipe archive data to the file
archive.pipe(output);

// append files from a directory
archive.directory(`${__dirname}/../build-browserext/`, '');

// finalize the archive (ie we are done appending files but streams have to finish yet)
archive.finalize();
