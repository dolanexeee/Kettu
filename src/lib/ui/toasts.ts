import { Strings } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { diagFlushNow, diagLog } from "@lib/api/diag";

// ROUND 18 (Discord 353): ALL toasts are neutralized. The live Mana-form
// toast (toasts.open) hung the UI after an Install tap on max6.8
// (diag-9: the page kept re-rendering, JS alive, screen black/frozen
// until navigate out/back — same silent-discard family as the round-5
// toast crash). No Kettu toast entry is safe on 353 until one is proven
// to render on-device. Install/Uninstall success stays visible via the
// button flipping state. The TOAST SKIPPED marker proves in the next log
// that the toast path was skipped.
export const showToast = (content: string, asset?: number) => {
    try { diagLog(`TOAST SKIPPED content=${content}`); diagFlushNow(); } catch { /* ignore */ }
};

showToast.showCopyToClipboard = (message = Strings.COPIED_TO_CLIPBOARD) => {
    showToast(message, findAssetId("toast_copy_link"));
};
