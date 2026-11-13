import { colorsPref } from "@lib/addons/themes/colors/preferences";
import { _colorRef } from "@lib/addons/themes/colors/updater";
import { after } from "@lib/api/patcher";
import { useObservable } from "@lib/api/storage";
import { findInReactTree } from "@lib/utils";
import { findByFilePathLazy } from "@metro";
import { _lazyContextSymbol } from "@metro/lazy";
import type { LazyModuleContext } from "@metro/types";
import chroma from "chroma-js";
import { ImageBackground, StyleSheet } from "react-native";
import { logger } from "@lib/utils/logger";

const Messages = findByFilePathLazy("modules/messages/native/Messages.tsx", true);

function ThemeBackground({ children }: { children: React.ReactNode; }) {
    useObservable([colorsPref]);

    if (!_colorRef.current
        || colorsPref.customBackground === "hidden"
        || !_colorRef.current.background?.url
        || _colorRef.current.background?.blur && (typeof _colorRef.current.background?.blur !== "number")
    ) {
        return children;
    }

    return <ImageBackground
        style={{ flex: 1, height: "100%" }}
        source={{ uri: _colorRef.current.background?.url }}
        blurRadius={_colorRef.current.background?.blur}
    >
        {children}
    </ImageBackground>;
}

export default function patchChatBackground() {
    // ROUND 6 (Discord 353): Messages.tsx's default export is a FUNCTION
    // component on 353 (no .render method). Patching .render on it makes the
    // patcher throw "render is not a function in Function" the first time the
    // Messages module loads (ChatView render) and crashes the app — the throw
    // happens inside the lazy subscription callback, so no try/catch around
    // the registration can catch it. Resolve the export first and only patch
    // when it is actually a class with a render method; otherwise skip the
    // chat background image (theme still applies, app survives).
    let unpatch: (() => void) | null = null;
    try {
        const ctxt: LazyModuleContext = (Messages as any)[_lazyContextSymbol];
        ctxt.getExports((exp: any) => {
            if (!exp || typeof exp.render !== "function") {
                logger.warn("Skipping chat background patch: Messages has no render method on this build (function component).");
                return;
            }

            unpatch = after("render", exp, (_, ret) => {
                if (!_colorRef.current || !_colorRef.current.background?.url) return;

                const messagesComponent = findInReactTree(
                    ret,
                    x => x && "HACK_fixModalInteraction" in x.props && x?.props?.style
                );

                if (messagesComponent) {
                    const flattened = StyleSheet.flatten(messagesComponent.props.style);
                    const backgroundColor = chroma(
                        flattened.backgroundColor || "black"
                    ).alpha(
                        1 - (_colorRef.current.background?.opacity ?? 1)
                    ).hex();

                    messagesComponent.props.style = StyleSheet.flatten([
                        messagesComponent.props.style,
                        { backgroundColor }
                    ]);
                }

                return <ThemeBackground>{ret}</ThemeBackground>;
            });
        });
    } catch (e) {
        logger.error("Failed to patch chat background.", e);
    }
    return () => {
        try { unpatch?.(); } catch { /* already unpatched */ }
    };
}