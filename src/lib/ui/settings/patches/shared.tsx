import { diagFlushNow, diagLog, idOf } from "@lib/api/diag";
import { NavigationNative } from "@metro/common";
import { findByPropsLazy } from "@metro/wrappers";
import { ErrorBoundary } from "@ui/components";
import { RowConfig } from "@ui/settings";

const tabsNavigationRef = findByPropsLazy("getRootNavigationRef");

export const CustomPageRenderer = React.memo(() => {
    const navigation = NavigationNative.useNavigation();
    const route = NavigationNative.useRoute();

    // ROUND 15 (Discord 353): stabilize the page subtree against
    // navigation-object churn. On 353 the navigator replaces the
    // navigation object when the push transition settles (navId 1→3→5
    // in the logs) and every useNavigation consumer re-renders; the
    // Plugins page re-rendered ~10x per tap and never committed.
    // Capture the FIRST navigation/params and build the page element
    // exactly once (useMemo []), so later context churn cannot
    // re-render the page subtree at all. The renderer itself may still
    // re-render (the CUSTOMPAGE RENDER marker above shows it) but its
    // children will not — the log will prove it: PLUGINS RENDER START
    // should fire 1x per tap if the stabilization holds.
    const firstNavRef = React.useRef(navigation);
    const firstParamsRef = React.useRef(route.params);
    const firstPageRef = React.useRef(route.params?.render);
    const firstArgsRef = React.useRef((() => {
        const { render: _r, ...rest } = route.params ?? {};
        return rest;
    })());

    // ROUND 11 (diagnostic): log the mount attempt. If renderType is
    // undefined, route.params lost the render fn between navigate and
    // mount — patchJsx then rewrites the element to a blank RCTView
    // (black screen, no error, no mount marker). Flushed immediately:
    // if JS dies right after this, the line is already on disk.
    try {
        diagLog(`CUSTOMPAGE RENDER params=[${Object.keys(route.params ?? {}).join(",")}] renderType=${typeof firstPageRef.current} navId=${idOf(navigation)} paramsId=${idOf(route.params)}`);
        diagFlushNow();
    } catch { /* never break rendering for logging */ }

    React.useEffect(() => void firstNavRef.current.setOptions({ ...firstArgsRef.current }), []);

    const element = React.useMemo(() => {
        const Page = firstPageRef.current;
        try { diagLog(`CUSTOMPAGE ELEMENT CREATED renderType=${typeof Page}`); diagFlushNow(); } catch { /* ignore */ }
        if (typeof Page !== "function") return null;
        return <ErrorBoundary label="CustomPage"><Page /></ErrorBoundary>;
    }, []);

    return element;
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

