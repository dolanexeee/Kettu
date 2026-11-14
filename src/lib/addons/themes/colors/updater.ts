import { diagLog } from "@lib/api/diag";
import { settings } from "@lib/api/settings";
import { findByProps, findByPropsLazy, findByStoreNameLazy } from "@metro";

import { parseColorManifest } from "./parser";
import { ColorManifest, InternalColorDefinition } from "./types";

const tokenRef = findByProps("SemanticColor");
const origRawColor = { ...tokenRef.RawColor };
const AppearanceManager = findByPropsLazy("updateTheme");
const ThemeStore = findByStoreNameLazy("ThemeStore");
const FormDivider = findByPropsLazy("DIVIDER_COLORS");

let _inc = 1;

interface InternalColorRef {
    key: `bn-theme-${string}`;
    current: InternalColorDefinition | null;
    readonly origRaw: Record<string, string>;
    lastSetDiscordTheme: string;
}

/** @internal */
export const _colorRef: InternalColorRef = {
    current: null,
    key: `bn-theme-${_inc}`,
    origRaw: origRawColor,
    lastSetDiscordTheme: "darker"
};

export function updateBunnyColor(colorManifest: ColorManifest | null, { update = true }) {
    if (settings.safeMode?.enabled) return;

    const internalDef = colorManifest ? parseColorManifest(colorManifest) : null;
    const ref = Object.assign(_colorRef, {
        current: internalDef,
        key: `bn-theme-${++_inc}`,
        lastSetDiscordTheme: !ThemeStore.theme.startsWith("bn-theme-")
            ? ThemeStore.theme
            : _colorRef.lastSetDiscordTheme
    });

    if (internalDef != null) {
        tokenRef.Theme[ref.key.toUpperCase()] = ref.key;
        FormDivider.DIVIDER_COLORS[ref.key] = FormDivider.DIVIDER_COLORS[ref.current!.reference];

        Object.keys(tokenRef.Shadow).forEach(k => tokenRef.Shadow[k][ref.key] = tokenRef.Shadow[k][ref.current!.reference]);
        Object.keys(tokenRef.SemanticColor).forEach(k => {
            tokenRef.SemanticColor[k][ref.key] = {
                ...tokenRef.SemanticColor[k][ref.current!.reference]
            };
        });
    }

    if (update) {
        // ROUND 20 (Discord 353 keyboard dismiss): ThemeStore.theme must
        // always be a REAL native theme ("darker"/"light"). Passing the
        // fake bn-theme-N key here left JS holding a key unknown to iOS
        // while native held the reference — any native<->JS re-derivation
        // (keyboard-focus appearance sync, settings sync) flipped the
        // theme and re-rendered the whole app, unmounting the focused
        // TextInput and dismissing the keyboard on every tap. Color
        // resolution is driven by _colorRef.current (see resolver.ts),
        // not by this key, so passing the reference changes nothing
        // about the applied colors.
        AppearanceManager.setShouldSyncAppearanceSettings(false);
        AppearanceManager.updateTheme(internalDef != null ? ref.current!.reference : ref.lastSetDiscordTheme);
        if (internalDef != null) {
            try { diagLog(`THEME KEY STABLE ref=${ref.current!.reference}`); } catch { /* ignore */ }
        }
    }
}
