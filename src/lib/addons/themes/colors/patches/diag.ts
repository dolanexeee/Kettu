// ROUND 20 — theme/keyboard diagnostics (Discord 353 keyboard dismiss).
//
// Logs every AppearanceManager.updateTheme call, every ThemeStore theme
// change, and keyboard show/hide events, plus a one-time MMKV get
// identity probe. Everything is guarded: diagnostics must never break
// theming, so every registration and every log line is wrapped.
import { diagLog } from "@lib/api/diag";
import { after } from "@lib/api/patcher";
import { findByProps, findByPropsLazy, findByStoreNameLazy } from "@metro";
import { proxyLazy } from "@lib/utils/lazy";
import { Keyboard } from "react-native";

const AppearanceManager = findByPropsLazy("updateTheme");
const ThemeStore = findByStoreNameLazy("ThemeStore");

const mmkvStorage = proxyLazy(() => {
    const newModule = findByProps("impl");
    if (typeof newModule?.impl === "object") return newModule.impl;
    return findByProps("storage");
});

export default function patchThemeDiag() {
    const unpatches: (() => unknown)[] = [];

    try {
        unpatches.push(after("updateTheme", AppearanceManager, ([arg]) => {
            try {
                diagLog(`THEME UPDATETHEME arg=${arg} store=${(ThemeStore as any)?.theme}`);
            } catch { /* ignore */ }
        }));
    } catch { /* ignore */ }

    try {
        const onChange = () => {
            try { diagLog(`THEME STORE theme=${(ThemeStore as any)?.theme}`); } catch { /* ignore */ }
        };
        (ThemeStore as any)?.addChangeListener?.(onChange);
        unpatches.push(() => { try { (ThemeStore as any)?.removeChangeListener?.(onChange); } catch { /* ignore */ } });
    } catch { /* ignore */ }

    try {
        const showSub = Keyboard.addListener("keyboardWillShow", () => {
            try { diagLog("THEME KB SHOW"); } catch { /* ignore */ }
        });
        const hideSub = Keyboard.addListener("keyboardWillHide", () => {
            try { diagLog("THEME KB HIDE"); } catch { /* ignore */ }
        });
        unpatches.push(() => {
            try { showSub.remove(); } catch { /* ignore */ }
            try { hideSub.remove(); } catch { /* ignore */ }
        });
    } catch { /* ignore */ }

    // One-time probe: does MMKV get() return the same object identity
    // across calls (live/cached) or a fresh parse? Settles whether the
    // old storage get-patch mutation could ever have touched live state.
    try {
        const a = (mmkvStorage as any)?.get?.("ThemeStore");
        const b = (mmkvStorage as any)?.get?.("ThemeStore");
        diagLog(`THEME STORAGE GET sameObj=${a === b} hasState=${!!a?._state}`);
    } catch { /* ignore */ }

    return () => unpatches.forEach(p => { try { p(); } catch { /* ignore */ } });
}
