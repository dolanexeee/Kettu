import { diagFlushNow, diagLog, idOf } from "@lib/api/diag";
import { NavigationNative } from "@metro/common";
import { findByPropsLazy } from "@metro/wrappers";
import { ErrorBoundary } from "@ui/components";
import { RowConfig } from "@ui/settings";

const tabsNavigationRef = findByPropsLazy("getRootNavigationRef");

export const CustomPageRenderer = React.memo(() => {
    const navigation = NavigationNative.useNavigation();
    const route = NavigationNative.useRoute();

    const { render: PageComponent, ...args } = route.params;

    // ROUND 11 (diagnostic): log the mount attempt. If renderType is
    // undefined, route.params lost the render fn between navigate and
    // mount — patchJsx then rewrites the element to a blank RCTView
    // (black screen, no error, no mount marker). Flushed immediately:
    // if JS dies right after this, the line is already on disk.
    try {
        diagLog(`CUSTOMPAGE RENDER params=[${Object.keys(route.params ?? {}).join(",")}] renderType=${typeof PageComponent} navId=${idOf(navigation)} paramsId=${idOf(route.params)}`);
        diagFlushNow();
    } catch { /* never break rendering for logging */ }

    React.useEffect(() => void navigation.setOptions({ ...args }), []);

    return <ErrorBoundary label="CustomPage"><PageComponent /></ErrorBoundary>;
});

export function wrapOnPress(
    onPress: (() => unknown) | undefined,
    navigation?: any,
    renderPromise?: RowConfig["render"],
    screenOptions?: string | Record<string, any>,
    props?: any,
) {
    return async () => {
        if (onPress) return void onPress();

        // ROUND 11 (diagnostic): trace the tap -> import -> navigate
        // flow with immediate flushes, so the last line on disk names
        // the exact step where a black screen stops the flow.
        const title = typeof screenOptions === "string" ? screenOptions : (screenOptions as any)?.title;
        try { diagLog(`WRAP TAP title=${title}`); diagFlushNow(); } catch { /* ignore */ }

        let Component: any;
        try {
            try { diagLog("WRAP IMPORT START"); diagFlushNow(); } catch { /* ignore */ }
            Component = await renderPromise!!().then(m => m.default);
            try { diagLog(`WRAP IMPORT OK component=${typeof Component}`); diagFlushNow(); } catch { /* ignore */ }
        } catch (e) {
            try { diagLog(`WRAP IMPORT FAIL ${e instanceof Error ? e.message : String(e)}`); diagFlushNow(); } catch { /* ignore */ }
            throw e;
        }

        if (typeof screenOptions === "string") {
            screenOptions = { title: screenOptions };
        }

        navigation ??= tabsNavigationRef.getRootNavigationRef();
        try {
            try { diagLog("WRAP NAVIGATE route=PUPU_CUSTOM_PAGE"); diagFlushNow(); } catch { /* ignore */ }
            navigation.navigate("PUPU_CUSTOM_PAGE", {
                ...screenOptions,
                render: () => <Component {...props} />
            });
        } catch (e) {
            try { diagLog(`WRAP NAVIGATE FAIL ${e instanceof Error ? e.message : String(e)}`); diagFlushNow(); } catch { /* ignore */ }
            throw e;
        }
    };
}

