import { _colorRef } from "@lib/addons/themes/colors/updater";
import { diagLog } from "@lib/api/diag";
import { NativeThemeModule } from "@lib/api/native/modules";
import { before, instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import chroma from "chroma-js";

const tokenReference = findByProps("SemanticColor");
const themeTypes = findByProps("ThemeTypes")?.ThemeTypes;

const origRawColor = { ...tokenReference.RawColor };
const origDarker = themeTypes.DARKER as string;
const origLight = themeTypes.LIGHT as string;

const SEMANTIC_FALLBACK_MAP: Record<string, string> = {
    "BG_BACKDROP": "BACKGROUND_FLOATING",
    "BG_BASE_PRIMARY": "BACKGROUND_PRIMARY",
    "BG_BASE_SECONDARY": "BACKGROUND_SECONDARY",
    "BG_BASE_TERTIARY": "BACKGROUND_SECONDARY_ALT",
    "BG_MOD_FAINT": "BACKGROUND_MODIFIER_ACCENT",
    "BG_MOD_STRONG": "BACKGROUND_MODIFIER_ACCENT",
    "BG_MOD_SUBTLE": "BACKGROUND_MODIFIER_ACCENT",
    "BG_SURFACE_OVERLAY": "BACKGROUND_FLOATING",
    "BG_SURFACE_OVERLAY_TMP": "BACKGROUND_FLOATING",
    "BG_SURFACE_RAISED": "BACKGROUND_MOBILE_PRIMARY"
};

export default function patchDefinitionAndResolver() {
    // ROUND 20: safety net only. updateBunnyColor no longer passes the
    // fake bn-theme-N key to updateTheme, so this should never fire. If
    // it does, a fake key leaked from a path outside updateBunnyColor.
    const callback = ([theme]: any[]) => {
        if (theme === _colorRef.key) {
            try { diagLog(`THEME NATIVE REDIRECT leaked key=${theme} -> ${_colorRef.current!.reference}`); } catch { /* ignore */ }
            return [_colorRef.current!.reference];
        }
        return void 0;
    };

    // ROUND 20: the fake key no longer leaks into theme comparisons.
    // ThemeTypes.DARKER/LIGHT always return the real native values;
    // ThemeStore.theme is the reference theme now.
    Object.defineProperty(themeTypes, "DARKER", {
        configurable: true,
        enumerable: true,
        get: () => origDarker,
    });
    Object.defineProperty(themeTypes, "LIGHT", {
        configurable: true,
        enumerable: true,
        get: () => origLight,
    });

    Object.keys(tokenReference.RawColor).forEach(key => {
        Object.defineProperty(tokenReference.RawColor, key, {
            configurable: true,
            enumerable: true,
            get: () => {
                const ret = _colorRef.current?.raw[key];
                if (ret) return ret;
                return origRawColor[key];
            }
        });
    });

    const unpatches = [
        before("updateTheme", NativeThemeModule, callback),
        instead("resolveSemanticColor", tokenReference.default.meta ?? tokenReference.default.internal, (args: any[], orig: any) => {
            if (!_colorRef.current) return orig(...args);
            // ROUND 20: ThemeStore.theme is now the native reference
            // theme ("darker"/"light"), not the fake bn-theme-N key.
            // Resolve custom colors whenever a custom theme is active
            // and the requested theme is that reference.
            if (args[0] !== _colorRef.current.reference) return orig(...args);

            const [name, colorDef] = extractInfo(_colorRef.current!.reference, args[1]);

            let semanticDef = _colorRef.current.semantic[name];
            if (!semanticDef && _colorRef.current.spec === 2 && name in SEMANTIC_FALLBACK_MAP) {
                semanticDef = _colorRef.current.semantic[SEMANTIC_FALLBACK_MAP[name]];
            }

            if (semanticDef?.value) {
                return semanticDef.opacity === 1
                    ? semanticDef.value
                    : chroma(semanticDef.value).alpha(semanticDef.opacity).hex();
            }

            const rawValue = _colorRef.current.raw[colorDef.raw];
            if (rawValue) {
                // Set opacity if needed
                return colorDef.opacity === 1 ? rawValue : chroma(rawValue).alpha(colorDef.opacity).hex();
            }

            // Fallback to default
            return orig(...args);
        }),
        () => {
            Object.defineProperty(themeTypes, "DARKER", {
                configurable: true, writable: true, value: origDarker
            });
            Object.defineProperty(themeTypes, "LIGHT", {
                configurable: true, writable: true, value: origLight
            });
            Object.defineProperty(tokenReference, "RawColor", {
                configurable: true,
                writable: true,
                value: origRawColor
            });
        }
    ];

    return () => unpatches.forEach(p => p());
}

function extractInfo(themeName: string, colorObj: any): [name: string, colorDef: any] {
    // @ts-ignore - assigning to extractInfo._sym
    const propName = colorObj[extractInfo._sym ??= Object.getOwnPropertySymbols(colorObj)[0]];
    const colorDef = tokenReference.SemanticColor[propName];

    return [propName, colorDef[themeName]];
}
