import patchChatBackground from "./patches/background";
import patchDefinitionAndResolver from "./patches/resolver";
import patchThemeDiag from "./patches/diag";
import { ColorManifest } from "./types";
import { updateBunnyColor } from "./updater";

/** @internal */
export default function initColors(manifest: ColorManifest | null) {
    if (manifest) updateBunnyColor(manifest, { update: false });

    const patches = [
        // ROUND 20: patchStorage deleted — the fake bn-theme-N key no
        // longer reaches ThemeStore or MMKV, so the get/set patches
        // have nothing to rewrite.
        patchDefinitionAndResolver(),
        patchChatBackground(),
        patchThemeDiag()
    ];

    return () => patches.forEach(p => p());
}