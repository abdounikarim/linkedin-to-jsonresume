/**
 * Popup script.
 *
 * Rewritten to use the cross-browser `browser.*` promise-based API (provided by the
 * `webextension-polyfill` UMD bundle, loaded via <script src="browser-polyfill.min.js">
 * in popup.html, ahead of this file) instead of calling `chrome.*` directly, and to use
 * Manifest V3's `browser.scripting.executeScript()` (with real functions + args) instead
 * of the old Manifest V2 `chrome.tabs.executeScript({code: '...'})` string-eval pattern.
 *
 * One nice side effect of `scripting.executeScript`: unlike the old `code:` string form,
 * it properly awaits a Promise returned by the injected function and resolves with its
 * value - so the old "inject an async IIFE that calls chrome.runtime.sendMessage(...) to
 * report back its result" workaround is no longer needed; we can just `await` the result
 * directly.
 */

/**
 * =============================
 * =        Constants          =
 * =============================
 */

const STORAGE_KEYS = {
    schemaVersion: 'schemaVersion'
};
const SPEC_SELECT = /** @type {HTMLSelectElement} */ (document.getElementById('specSelect'));
/** @type {SchemaVersion[]} */
const SPEC_OPTIONS = ['legacy', 'stable', 'beta'];
/** @type {HTMLSelectElement} */
const LANG_SELECT = document.querySelector('.langSelect');

/**
 * Get the id of the tab this popup is attached to.
 * @returns {Promise<number>}
 */
const getActiveTabId = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab.id;
};

/**
 * Inject a function into the active tab's page (isolated content-script world) and
 * return its (possibly async) return value.
 * @param {(...args: any[]) => any} func
 * @param {any[]} [args]
 * @returns {Promise<any>}
 */
const injectIntoActiveTab = async (func, args = []) => {
    const tabId = await getActiveTabId();
    const [{ result }] = await browser.scripting.executeScript({
        target: { tabId },
        func,
        args
    });
    return result;
};

/**
 * =============================
 * =  Functions injected into  =
 * =    the LinkedIn page      =
 * =============================
 * These run inside the page's isolated content-script world, *not* in the popup - they
 * get serialized by `scripting.executeScript()`, so they must be fully self-contained
 * (no closing over variables from the popup's scope).
 */

/**
 * Create (or reuse) the `LinkedinToResumeJson` instance for this page, and stash it on
 * `window` so later injections (which run in the same isolated world, as long as the
 * page hasn't navigated) can reuse it.
 */
function ensureMainInstance() {
    const isDebug = window.location.href.includes('li2jr_debug=true');
    window.liToJrInstance = window.liToJrInstance || new window.LinkedinToResumeJson(isDebug);
}

/**
 * @returns {Promise<{supported: string[], user: string}>}
 */
async function collectLocaleInfo() {
    const supported = await window.liToJrInstance.getSupportedLocales();
    const user = window.liToJrInstance.getViewersLocalLang();
    return { supported, user };
}

/**
 * @param {string} lang
 */
function setPreferredLocale(lang) {
    window.liToJrInstance.preferLocale = lang;
}

/**
 * @param {string} lang
 * @param {SchemaVersion} version
 */
function runAndShowOutput(lang, version) {
    window.liToJrInstance.preferLocale = lang;
    window.liToJrInstance.parseAndShowOutput(version);
}

/**
 * @param {string} lang
 */
function downloadOutput(lang) {
    window.liToJrInstance.preferLocale = lang;
    window.liToJrInstance.parseAndDownload();
}

function exportVCardInPage() {
    window.liToJrInstance.generateVCard();
}

/**
 * =============================
 * =        Popup UI logic     =
 * =============================
 */

/**
 * Get the currently selected lang locale in the selector
 */
const getSelectedLang = () => {
    return LANG_SELECT.value;
};

/**
 * Toggle enabled state of popup
 * @param {boolean} isEnabled
 */
const toggleEnabled = (isEnabled) => {
    document.querySelectorAll('.toggle').forEach((elem) => {
        elem.classList.remove(isEnabled ? 'disabled' : 'enabled');
        elem.classList.add(isEnabled ? 'enabled' : 'disabled');
    });
};

/**
 * Load list of language strings to be displayed as options
 * @param {string[]} langs
 */
const loadLangs = (langs) => {
    LANG_SELECT.innerHTML = '';
    langs.forEach((lang) => {
        const option = document.createElement('option');
        option.value = lang;
        option.innerText = lang;
        LANG_SELECT.appendChild(option);
    });
    toggleEnabled(langs.length > 0);
};

/**
 * Set the desired export lang on the exporter instance
 * @param {string} lang
 */
const setLang = (lang) => {
    injectIntoActiveTab(setPreferredLocale, [lang]);
};

/** @param {SchemaVersion} version */
const setSpecVersion = (version) => {
    browser.storage.sync.set({
        [STORAGE_KEYS.schemaVersion]: version
    });
};

/**
 * Get user's preference for JSONResume Spec Version
 * @returns {Promise<SchemaVersion>}
 */
const getSpecVersion = async () => {
    // Fallback value will be what is already selected in dropdown
    const fallbackVersion = /** @type {SchemaVersion} */ (SPEC_SELECT.value);
    try {
        const result = await browser.storage.sync.get([STORAGE_KEYS.schemaVersion]);
        const storedSetting = /** @type {string} */ (result[STORAGE_KEYS.schemaVersion] || '');
        return SPEC_OPTIONS.includes(/** @type {SchemaVersion} */ (storedSetting)) ? /** @type {SchemaVersion} */ (storedSetting) : fallbackVersion;
    } catch (err) {
        console.error(err);
        return fallbackVersion;
    }
};

/**
 * =============================
 * =   Setup Event Listeners   =
 * =============================
 */

document.getElementById('liToJsonButton').addEventListener('click', async () => {
    const versionOption = await getSpecVersion();
    await injectIntoActiveTab(runAndShowOutput, [getSelectedLang(), versionOption]);
    setTimeout(() => {
        // Close popup
        window.close();
    }, 700);
});

document.getElementById('liToJsonDownloadButton').addEventListener('click', () => {
    injectIntoActiveTab(downloadOutput, [getSelectedLang()]);
});

LANG_SELECT.addEventListener('change', () => {
    setLang(getSelectedLang());
});

document.getElementById('vcardExportButton').addEventListener('click', () => {
    injectIntoActiveTab(exportVCardInPage);
});

SPEC_SELECT.addEventListener('change', () => {
    setSpecVersion(/** @type {SchemaVersion} */ (SPEC_SELECT.value));
});

/**
 * =============================
 * =           Init            =
 * =============================
 */
document.getElementById('versionDisplay').innerText = browser.runtime.getManifest().version;

(async () => {
    try {
        const tabId = await getActiveTabId();
        // Inject the (webpacked) main content script file itself first...
        await browser.scripting.executeScript({
            target: { tabId },
            files: ['main.js']
        });
        // ...then create/reuse the exporter instance...
        await injectIntoActiveTab(ensureMainInstance);
        // ...then ask it what languages are available for this profile.
        const { supported, user } = await injectIntoActiveTab(collectLocaleInfo);
        // Make sure user's own locale comes as first option
        if (supported.includes(user)) {
            supported.splice(supported.indexOf(user), 1);
        }
        supported.unshift(user);
        loadLangs(supported);
    } catch (err) {
        // Most likely cause: the active tab isn't a LinkedIn profile page.
        console.error(err);
    }
})();

getSpecVersion().then((spec) => {
    SPEC_SELECT.value = spec;
});
