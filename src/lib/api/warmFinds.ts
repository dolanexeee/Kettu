// ROUND 9 — warm the Metro finds the addon pages need (Discord 353).
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
// This runs the same finds in the background after boot, one per
// macrotask, so the findIndex is populated before the user opens an
// addon page and the first open is O(1) per find. Every touch is
// guarded: a find that fails on this build (renamed/removed component)
// is simply skipped — the page's own error boundary handles it later.
// Fire-and-forget; never awaited; safe to call once at boot.

import { NavigationNative, clipboard, tokens } from "@metro/common";
import * as components from "@metro/common/components";

// One touch per entry. Accessing any property on a lazy proxy forces its
// factory (the Metro find) and populates the findIndex via cacheId.
// `.displayName` is benign on both function components and plain objects.
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

export function warmAddonFinds() {
    let i = 0;
    const step = () => {
        if (i >= TOUCHES.length) return;
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
