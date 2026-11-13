// ROUND 10 — warm the Metro finds the addon pages need (Discord 353).
//
// Root cause (see ROUND9-DIAGNOSIS.md): on a cold cache (fresh install)
// every distinct lazy find is a full scan of all Discord modules. The
// Plugins / Addon Browser / Themes pages resolve ~15-20 distinct
// component filters synchronously on first open (FlashList, TextInput,
// Button, Card, Text, IconButton, Stack, TableSwitch, ...), which blocks
// the JS thread for tens of seconds — the pushed screen stays black and
// back navigation is dead until the scans finish. The round-8 storm only
// warms module *initialisation*; it never populates the *findIndex*, so
// it could not fix this.
//
// ROUND 9 tried to fix it by touching ~36 lazy proxies one per macrotask
// in the background. That ALSO failed on-device (max6.2, fresh install):
// each touch is itself a full cold-cache scan, so the warm-up needs tens
// of seconds — the user opens Plugins within seconds, so the page's first
// render still did ~15-20 synchronous cold scans. The warm-up was
// structurally too slow for an immediate page open; the memoized
// proxyLazy only prevents REPEATED scans, not the first-open cost.
//
// ROUND 10 fix: warm every filter in ONE pass over the registry
// (finders.warmFiltersAsync), testing all registered filters per module
// and populating the findIndex for all matches at once. One scan instead
// of ~36, so the warm-up costs roughly one scan (~seconds) instead of
// tens of seconds. Filters register themselves when created
// (createLazyModule, findProp/findSingular); the few created lazily
// inside closures (lazyDestructure factories) are registered explicitly
// below. The findIndex is keyed by the filter's uniq string, so warming
// a uniq warms every proxy that uses it.
//
// After the single pass, the old proxy-touch loop runs as a safety net:
// touches are O(1) for warmed proxies (memoized + findIndex hit), and
// only a filter the single pass missed would do a full scan.
//
// Timings are written to the diagnostic log (kettu-diag.log) so the
// on-device behaviour is measurable: warm duration, filters warmed,
// and every slow find (>100 ms) with its uniq.

import { diagLog } from "@lib/api/diag";
import { NavigationNative, clipboard, tokens } from "@metro/common";
import * as components from "@metro/common/components";
import { byProps } from "@metro/filters";
import { getWarmFilters, registerWarmFilter, warmFiltersAsync } from "@metro/finders";

// Filters created lazily inside closures (lazyDestructure factories) —
// not auto-registered by createLazyModule/findProp/findSingular, so
// register them explicitly. (The SafeAreaView/useToken destructures and
// the Plugins page's own lazyDestructures. Same uniq as the closures'
// findByProps calls, so warming these warms those proxies too.)
registerWarmFilter(byProps("useSafeAreaInsets"));
registerWarmFilter(byProps("useToken"));
registerWarmFilter(byProps("openAlert", "dismissAlert"));
registerWarmFilter(byProps("AlertModal", "AlertActions"));

// Safety net (ROUND 9 touches). Accessing any property on a lazy proxy
// forces its factory (the Metro find) and populates the findIndex via
// cacheId. `.displayName` is benign on both function components and
// plain objects. After the single pass these are O(1); only a filter the
// pass missed would do a full scan here.
const TOUCHES: Array<() => unknown> = [
    () => (components.FlashList as any)?.displayName,
    () => (components.TextInput as any)?.displayName,
    () => (components.Button as any)?.displayName,
    () => (components.Card as any)?.displayName,
    () => (components.Text as any)?.displayName,
    () => (components.IconButton as any)?.displayName,
    () => (components.Stack as any)?.displayName,
    () => (components.TableSwitch as any)?.displayName,
    () => (components.FloatingActionButton as any)?.displayName,
    () => (components.AlertModal as any)?.displayName,
    () => (components.AlertActionButton as any)?.displayName,
    () => (components.AlertActions as any)?.displayName,
    () => (components.ActionSheet as any)?.displayName,
    () => (components.TableRow as any)?.displayName,
    () => (components.TableRowGroup as any)?.displayName,
    () => (components.TextArea as any)?.displayName,
    () => (components.ContextMenu as any)?.displayName,
    () => (components.Avatar as any)?.displayName,
    () => (components.TwinButtons as any)?.displayName,
    () => (components.RowButton as any)?.displayName,
    () => (components.PressableScale as any)?.displayName,
    () => (components.SegmentedControl as any)?.displayName,
    () => (components.CompatButton as any)?.displayName,
    () => (components.LegacyAlert as any)?.displayName,
    () => (components.SafeAreaView as any)?.displayName,
    () => (components.useSafeAreaInsets as any)?.displayName,
    () => (components.HelpMessage as any)?.displayName,
    () => (components.BottomSheetTitleHeader as any)?.displayName,
    () => (components.AvatarPile as any)?.displayName,
    () => (components.FormSwitch as any)?.displayName,
    () => (components.FormRadio as any)?.displayName,
    () => (components.FormCheckbox as any)?.displayName,
    () => (components.ActionSheetRow as any)?.displayName,
    () => (NavigationNative as any)?.displayName,
    () => (tokens as any)?.displayName,
    () => (clipboard as any)?.displayName,
];

export async function warmAddonFinds() {
    const filters = getWarmFilters();
    diagLog(`WARM START filters=${filters.length}`);
    try {
        const result = await warmFiltersAsync(filters, 100);
        // ROUND 11: log the notFound filter uniqs, not just the count.
        diagLog(`WARM DONE warmed=${result.warmed}/${result.filters} notFound=${result.notFound} scanned=${result.scanned} ms=${result.ms} missing=[${result.missing.join(",")}]`);
    } catch (e) {
        diagLog(`WARM ERROR ${e}`);
    }

    // Safety net: touch the proxies one per macrotask (ROUND 9 path).
    // O(1) for warmed proxies; a missed filter does one full scan here.
    let i = 0;
    const step = () => {
        if (i >= TOUCHES.length) { diagLog("WARM TOUCHES DONE"); return; }
        try {
            TOUCHES[i]();
        } catch {
            // Find failed on this build (renamed/removed module) — skip it.
            // The page will surface the miss through its error boundary.
        }
        i++;
        if (i < TOUCHES.length) setTimeout(step, 0);
    };
    // Start after the current macrotask so boot is not delayed.
    setTimeout(step, 0);
}
