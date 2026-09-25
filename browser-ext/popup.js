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
 * Get the id of the tab that this popup was opened for (i.e. the active tab in the current window).
 * This is needed because `chrome.scripting.executeScript` (the MV3 replacement for the old
 * `chrome.tabs.executeScript`) has no notion of an implicit "current tab" - it always requires an
 * explicit `target.tabId`.
 * @returns {Promise<number>}
 */
const getActiveTabId = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') {
        throw new Error('linkedin-to-jsonresume: could not find an active tab to inject into');
    }
    return tab.id;
};

/**
 * === Functions below this point are injected into the LinkedIn page (via `chrome.scripting.executeScript`) ===
 * They are serialized (`Function.prototype.toString`) and re-run inside the page's own isolated-world
 * context, so they must be fully self-contained - they can't close over any variables from this file's
 * scope. State that needs to survive between separate injections (e.g. the parser instance) is stashed
 * on the page's own `window`, which persists across injections for as long as the tab isn't navigated -
 * exactly like it did with `chrome.tabs.executeScript` under Manifest V2.
 */

/**
 * Create the `LinkedinToResumeJson` instance for this page, reusing one if it already exists
 * (e.g. from a previous time the popup was opened for this same tab).
 */
const createOrReuseInstanceInPage = () => {
    window.isDebug = window.location.href.includes('li2jr_debug=true');
    window.liToJrInstance = window.liToJrInstance || new window.LinkedinToResumeJson(window.isDebug);
};

/**
 * Read back the supported / user locales from the page's `liToJrInstance`.
 * @returns {Promise<{supported: string[], user: string}>}
 */
const getLangStringsInPage = async () => {
    const supported = await window.liToJrInstance.getSupportedLocales();
    const user = window.liToJrInstance.getViewersLocalLang();
    return { supported, user };
};

/**
 * @param {string} lang
 */
const setPreferLocaleInPage = (lang) => {
    window.liToJrInstance.preferLocale = lang;
    // eslint-disable-next-line no-console
    console.log(window.liToJrInstance);
    // eslint-disable-next-line no-console
    console.log(window.liToJrInstance.preferLocale);
};

const generateVCardInPage = () => {
    window.liToJrInstance.generateVCard();
};

/**
 * @param {string} lang
 * @param {SchemaVersion} version
 */
const parseAndShowOutputInPage = (lang, version) => {
    window.liToJrInstance.preferLocale = lang;
    window.liToJrInstance.parseAndShowOutput(version);
};

/**
 * @param {string} lang
 */
const parseAndDownloadInPage = (lang) => {
    window.liToJrInstance.preferLocale = lang;
    window.liToJrInstance.parseAndDownload();
};

/**
 * =============================
 * =      Injection Helpers    =
 * =============================
 */

/**
 * Inject `main.js` (the bundled scraper/parser, built from `src/main.js`) into the given tab.
 * Safe to call more than once - re-injecting just re-sets `window.LinkedinToResumeJson`, and
 * `createOrReuseInstanceInPage` takes care of reusing any existing parser instance.
 * @param {number} tabId
 */
const injectMainScript = (tabId) => {
    return chrome.scripting.executeScript({
        target: { tabId },
        files: ['main.js']
    });
};

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

const exportVCard = async () => {
    const tabId = await getActiveTabId();
    await chrome.scripting.executeScript({
        target: { tabId },
        func: generateVCardInPage
    });
};

/**
 * Set the desired export lang on the exporter instance
 * @param {string} lang
 */
const setLang = async (lang) => {
    const tabId = await getActiveTabId();
    await chrome.scripting.executeScript({
        target: { tabId },
        func: setPreferLocaleInPage,
        args: [lang]
    });
};

/** @param {SchemaVersion} version */
const setSpecVersion = (version) => {
    chrome.storage.sync.set({
        [STORAGE_KEYS.schemaVersion]: version
    });
};

/**
 * Get user's preference for JSONResume Spec Version
 * @returns {Promise<SchemaVersion>}
 */
const getSpecVersion = () => {
    // Fallback value will be what is already selected in dropdown
    const fallbackVersion = /** @type {SchemaVersion} */ (SPEC_SELECT.value);
    return new Promise((res) => {
        try {
            chrome.storage.sync.get([STORAGE_KEYS.schemaVersion], (result) => {
                const storedSetting = result[STORAGE_KEYS.schemaVersion] || '';
                if (SPEC_OPTIONS.includes(storedSetting)) {
                    res(storedSetting);
                } else {
                    res(fallbackVersion);
                }
            });
        } catch (err) {
            console.error(err);
            res(fallbackVersion);
        }
    });
};

/**
 * =============================
 * =   Setup Event Listeners   =
 * =============================
 */

document.getElementById('liToJsonButton').addEventListener('click', async () => {
    const versionOption = await getSpecVersion();
    const tabId = await getActiveTabId();
    await chrome.scripting.executeScript({
        target: { tabId },
        func: parseAndShowOutputInPage,
        args: [getSelectedLang(), versionOption]
    });
    setTimeout(() => {
        // Close popup
        window.close();
    }, 700);
});

document.getElementById('liToJsonDownloadButton').addEventListener('click', async () => {
    const tabId = await getActiveTabId();
    await chrome.scripting.executeScript({
        target: { tabId },
        func: parseAndDownloadInPage,
        args: [getSelectedLang()]
    });
});

LANG_SELECT.addEventListener('change', () => {
    setLang(getSelectedLang());
});

document.getElementById('vcardExportButton').addEventListener('click', () => {
    exportVCard();
});

SPEC_SELECT.addEventListener('change', () => {
    setSpecVersion(/** @type {SchemaVersion} */ (SPEC_SELECT.value));
});

/**
 * =============================
 * =           Init            =
 * =============================
 */
document.getElementById('versionDisplay').innerText = chrome.runtime.getManifest().version;

(async () => {
    const tabId = await getActiveTabId();
    await injectMainScript(tabId);
    await chrome.scripting.executeScript({
        target: { tabId },
        func: createOrReuseInstanceInPage
    });
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: getLangStringsInPage
    });
    const { supported, user } = result;
    // Make sure user's own locale comes as first option
    if (supported.includes(user)) {
        supported.splice(supported.indexOf(user), 1);
    }
    supported.unshift(user);
    loadLangs(supported);
})().catch((err) => {
    console.error('linkedin-to-jsonresume: failed to initialize popup', err);
});

getSpecVersion().then((spec) => {
    SPEC_SELECT.value = spec;
});
