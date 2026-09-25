/**
 * === MV3 service worker ===
 * This extension has no ongoing background work to do - `popup.js` does everything it needs via
 * `chrome.scripting`, on demand, whenever the popup is opened. `chrome.action.onClicked` is *not*
 * needed here since `manifest.json` sets a `default_popup`, which takes over click handling.
 *
 * The only thing this file is responsible for is replicating the old (MV2) `page_action` behavior
 * of only showing the toolbar icon on LinkedIn pages, instead of on every page. In MV3, `action`
 * icons are enabled everywhere by default, so to match the old UX we:
 *   1. Disable the action by default (on install/update).
 *   2. Use `declarativeContent` to re-enable ("show") it only on pages under linkedin.com.
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.action.disable();
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
        chrome.declarativeContent.onPageChanged.addRules([
            {
                conditions: [
                    new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: {
                            hostContains: 'linkedin.com'
                        }
                    })
                ],
                actions: [new chrome.declarativeContent.ShowAction()]
            }
        ]);
    });
});
