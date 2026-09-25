/**
 * Background service worker (Chrome/Edge, Manifest V3) / event page (Firefox).
 *
 * Its only job is to keep the toolbar action enabled only on LinkedIn pages. Under
 * Manifest V2 this extension used `page_action` + `chrome.declarativeContent` for
 * that, but `declarativeContent` is Chrome-only (Firefox has no equivalent) and
 * `page_action` doesn't exist in Manifest V3 - both were replaced here with the
 * cross-browser `action` API plus a `tabs.onUpdated`/`onActivated` listener, which
 * behaves identically on Chrome, Firefox, and Edge.
 *
 * === Loading the `browser.*` polyfill ===
 * - On Chrome (MV3 service worker context), `browser` is not a global until the
 *   `webextension-polyfill` UMD bundle is imported - `importScripts()` (a Worker-only
 *   API) does that below.
 * - On Firefox, `browser-polyfill.min.js` is instead loaded as its own background
 *   script, ahead of this one (see `manifest.firefox.json`'s `background.scripts`),
 *   because Firefox's Manifest V3 background is a regular script context (an "event
 *   page"), not a service worker - `importScripts` doesn't exist there at all, which
 *   is exactly what the `typeof importScripts === 'function'` guard below is for.
 */
if (typeof importScripts === 'function' && typeof browser === 'undefined') {
    importScripts('browser-polyfill.min.js');
}

const LINKEDIN_HOSTNAME_RE = /(^|\.)linkedin\.com$/;

/**
 * @param {string | undefined} url
 * @returns {boolean}
 */
const isLinkedinUrl = (url) => {
    if (!url) {
        return false;
    }
    try {
        return LINKEDIN_HOSTNAME_RE.test(new URL(url).hostname);
    } catch (err) {
        return false;
    }
};

/**
 * @param {number} tabId
 * @param {string | undefined} url
 */
const syncActionState = (tabId, url) => {
    if (isLinkedinUrl(url)) {
        browser.action.enable(tabId);
    } else {
        browser.action.disable(tabId);
    }
};

// Disabled by default; each tab gets (re-)enabled below once we know its URL.
browser.action.disable();

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        syncActionState(tabId, tab.url);
    }
});

browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs
        .get(tabId)
        .then((tab) => syncActionState(tabId, tab.url))
        .catch((err) => console.error(err));
});
