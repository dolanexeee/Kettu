import { getCurrentTheme, writeThemeToNative } from "@lib/addons/themes";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { settings } from "@lib/api/settings";

export function isSafeMode() {
    return settings.safeMode?.enabled === true;
}

export async function toggleSafeMode({
    to = !isSafeMode(),
    reload = true
} = {}) {
    const enabled = (settings.safeMode ??= { enabled: to }).enabled = to;
    const currentColor = getCurrentTheme();
    await writeThemeToNative(enabled ? {} : currentColor?.data ?? {});
    // ROUND 6: the safeMode flag write is async fire-and-forget (see
    // lib/api/debug.ts) — wait for it to flush before reloading, or safe mode
    // may not engage on the next boot.
    if (reload) {
        await new Promise(r => setTimeout(r, 1000));
        BundleUpdaterManager.reload();
    }
}
