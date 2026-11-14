import { CardWrapper } from "@core/ui/components/AddonCard";
import { findAssetId } from "@lib/api/assets";
import { diagFlushNow, diagLog } from "@lib/api/diag";
import { settings } from "@lib/api/settings";
import { dismissAlert, openAlert } from "@lib/ui/alerts";
import { showSheet } from "@lib/ui/sheets";
import isValidHttpUrl from "@lib/utils/isValidHttpUrl";
import { clipboard, NavigationNative } from "@metro/common";
import { AlertActionButton, AlertModal, Button, FloatingActionButton, HelpMessage, IconButton, Stack, Text, TextInput, useSafeAreaInsets } from "@metro/common/components";
import { isNotNil } from "es-toolkit";
import fuzzysort from "fuzzysort";
import { ComponentType, ReactNode, useCallback, useEffect, useMemo } from "react";
import { Image, Pressable, ScrollView, Text as RNText, View } from "react-native";

type SearchKeywords<T> = Array<string | ((obj: T & {}) => string)>;

interface AddonPageProps<T extends object, I = any> {
    title: string;
    items: I[];
    searchKeywords: SearchKeywords<T>;
    sortOptions?: Record<string, (a: T, b: T) => number>;
    resolveItem?: (value: I) => T | undefined;
    safeModeHint?: {
        message?: string;
        footer?: ReactNode;
    };
    installAction?: {
        label?: string;
        // Ignored when onPress is defined!
        fetchFn?: (url: string) => Promise<void>;
        onPress?: () => void;
    };

    OptionsActionSheetComponent?: ComponentType<any>;

    // ROUND 19 (Discord 353): bare rows — the CardComponent cards
    // (Card/Stack/Text/FormRadio/IconButton) never commit once an item
    // is installed (diag-10: ADDONPAGE RESULTS n=1, no mount, for
    // Themes; Fonts shares this page and would loop identically).
    // The row component renders plain RN primitives only and keeps the
    // card's tap behaviour (apply/select). CardComponent is gone.
    BareRowComponent: ComponentType<CardWrapper<T>>;
    ListHeaderComponent?: ComponentType<any>;
    ListFooterComponent?: ComponentType<any>;
}

function InputAlert(props: { label: string, fetchFn: (url: string) => Promise<void>; }) {
    const [value, setValue] = React.useState("");
    const [error, setError] = React.useState("");
    const [isFetching, setIsFetching] = React.useState(false);

    function onConfirmWrapper() {
        setIsFetching(true);

        props.fetchFn(value)
            .then(() => dismissAlert("AddonInputAlert"))
            .catch((e: unknown) => e instanceof Error ? setError(e.message) : String(e))
            .finally(() => setIsFetching(false));
    }

    return <AlertModal
        title={props.label}
        content="Type in the source URL you want to install from:"
        extraContent={
            <Stack style={{ marginTop: -12 }}>
                <TextInput
                    autoFocus={true}
                    isClearable={true}
                    value={value}
                    onChange={(v: string) => {
                        setValue(v);
                        if (error) setError("");
                    }}
                    returnKeyType="done"
                    onSubmitEditing={onConfirmWrapper}
                    state={error ? "error" : undefined}
                    errorMessage={error || undefined}
                />
                <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    style={{ gap: 8 }}
                >
                    <Button
                        size="sm"
                        variant="tertiary"
                        text="Import from clipboard"
                        icon={findAssetId("ClipboardListIcon")}
                        onPress={() => clipboard.getString().then((str: string) => setValue(str))}
                    />
                </ScrollView>
            </Stack>
        }
        actions={
            <Stack>
                {/* Manual button as we don't want alert to immediately dismiss when we tap on it */}
                <Button
                    loading={isFetching}
                    text="Install"
                    variant="primary"
                    disabled={!value || !isValidHttpUrl(value)}
                    onPress={onConfirmWrapper}
                />
                <AlertActionButton
                    disabled={isFetching}
                    text="Cancel"
                    variant="secondary"
                />
            </Stack>
        }
    />;
}

// Discord 353 removed the generic HelpMessage component (no module exports
// a component named HelpMessage — the Mana redesign). The lazy proxy in
// @metro/common/components throws on first use when it cannot resolve, which
// killed the whole Plugins/Themes page in Safe Mode. Resolve it defensively
// and fall back to plain text when it is absent.
function SafeModeNotice({ message, footer }: { message?: string; footer?: ReactNode }) {
    let ResolvedHelpMessage: typeof HelpMessage | null = null;
    try {
        // Any property read forces the lazy proxy to resolve (or throw).
        void (HelpMessage as any).displayName;
        ResolvedHelpMessage = HelpMessage;
    } catch {
        ResolvedHelpMessage = null;
    }

    if (ResolvedHelpMessage) {
        const HM = ResolvedHelpMessage;
        return <HM messageType={0}>{message}</HM>;
    }

    return (
        <>
            {message ? <Text variant="text-md/medium">{message}</Text> : null}
            {footer}
        </>
    );
}

export default function AddonPage<T extends object>({ BareRowComponent, ...props }: AddonPageProps<T>) {
    // ROUND 11 (diagnostic): render-start marker, flushed immediately.
    try { diagLog("ADDONPAGE RENDER START"); diagFlushNow(); } catch { /* ignore */ }
    // ROUND 15 (Discord 353): the search UI is REMOVED for now (see
    // header below). The state stays "" and fuzzysort still wraps the
    // items, so PluginCard's result[0/1/2].highlight() keeps working
    // unchanged.
    const [search] = React.useState("");
    const [sortFn, setSortFn] = React.useState<((a: T, b: T) => number) | null>(() => null);
    // ROUND 19 (Discord 353): the sort IconButton is gone (see header
    // below) — sorting cycles through the options on a plain Pressable
    // instead, same as the Addon Browser's "Sort: …" button (round 17).
    const [sortLabel, setSortLabel] = React.useState<string | null>(null);
    const cycleSort = () => {
        if (!props.sortOptions) return;
        const labels = ["Default", ...Object.keys(props.sortOptions)];
        const cur = sortLabel ?? "Default";
        const next = labels[(labels.indexOf(cur) + 1) % labels.length];
        if (next === "Default") {
            setSortFn(null);
            setSortLabel(null);
        } else {
            setSortFn(() => props.sortOptions![next]);
            setSortLabel(next);
        }
    };
    const { bottom: bottomInset } = useSafeAreaInsets();
    const navigation = NavigationNative.useNavigation();

    // ROUND 14 (fix verification): proves the page committed — effects run
    // only after commit. If this line is absent on-device, the commit is
    // still blocked even with the ScrollView list.
    // ROUND 15: also gates the FloatingActionButton below — the FAB only
    // renders after the first commit, so a native-view problem in the
    // FAB can no longer block the initial commit.
    const [mounted, setMounted] = React.useState(false);
    useEffect(() => {
        try { diagLog(`ADDONPAGE MOUNTED title=${props.title}`); diagFlushNow(); } catch { /* ignore */ }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (props.OptionsActionSheetComponent) {
            navigation.setOptions({
                headerRight: () => <IconButton
                    size="sm"
                    variant="secondary"
                    icon={findAssetId("MoreHorizontalIcon")}
                    onPress={() => showSheet("AddonMoreSheet", props.OptionsActionSheetComponent!)}
                />
            });
        }
    }, [navigation]);

    const results = useMemo(() => {
        let values = props.items;
        if (props.resolveItem) values = values.map(props.resolveItem).filter(isNotNil);
        const items = values.filter(i => isNotNil(i) && typeof i === "object");
        if (!search && sortFn) items.sort(sortFn);

        return fuzzysort.go(search, items, { keys: props.searchKeywords, all: true });
    }, [props.items, sortFn, search]);

    // ROUND 11 (diagnostic): did the item list compute?
    try { diagLog(`ADDONPAGE RESULTS n=${results.length}`); diagFlushNow(); } catch { /* ignore */ }

    // ROUND 19 (Discord 353): proves the render reached the bare rows.
    // If this line is absent while RESULTS is present, the render aborted
    // between the list computation and the row mapping.
    try { diagLog(`ADDONPAGE BARE ROWS n=${results.length}`); diagFlushNow(); } catch { /* ignore */ }

    const onInstallPress = useCallback(() => {
        if (!props.installAction) return () => { };
        const { label, onPress, fetchFn } = props.installAction;
        if (fetchFn) {
            openAlert("AddonInputAlert", <InputAlert label={label ?? "Install"} fetchFn={fetchFn} />);
        } else {
            onPress?.();
        }
    }, []);

    if (results.length === 0 && !search) {
        return <View style={{ gap: 32, flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
            <View style={{ gap: 8, alignItems: "center" }}>
                <Image source={findAssetId("empty_quick_switcher")!} />
                <Text variant="text-lg/semibold" color="text-default">
                    Oops! Nothing to see here… yet!
                </Text>
            </View>
            <Button
                size="lg"
                icon={findAssetId("DownloadIcon")}
                text={props.installAction?.label ?? "Install"}
                onPress={onInstallPress}
            />
        </View>;
    }

    const headerElement = (
        <View style={{ paddingBottom: 8 }}>
            {settings.safeMode?.enabled && <View style={{ marginBottom: 10 }}>
                <SafeModeNotice message={props.safeModeHint?.message} footer={props.safeModeHint?.footer} />
            </View>}
            {/* ROUND 19 (Discord 353): the sort <IconButton> is REMOVED.
                Evidence: with n=1 the non-empty path paints the sort
                IconButton (header) + the first card, and neither is ever
                painted by a committing page's first paint — the same
                elimination that proved Card + IconButton in round 17.
                Sorting cycles on a plain Pressable instead (same pattern
                as the Addon Browser, round 17); the action sheet is
                deferred. */}
            {props.sortOptions && <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                    onPress={cycleSort}
                    style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                >
                    <RNText style={{ color: "#FFFFFF", fontWeight: "600" }}>
                        Sort: {sortLabel ?? "Default"}
                    </RNText>
                </Pressable>
            </View>}
            {props.ListHeaderComponent && <props.ListHeaderComponent />}
        </View>
    );

    // ROUND 14 (Discord 353): FlashList never commits on 353 for these
    // pages (proven by the rd logs: full render completes, mount effect
    // never runs, no cards). A plain ScrollView renders the same items
    // through plain Views — the same primitives the General settings
    // page uses, which commit fine. Lists here are short (10 plugins,
    // a handful of themes/fonts), so virtualization is not needed.
    const listEmptyElement = (
        <View style={{ gap: 12, padding: 12, alignItems: "center" }}>
            <Image source={findAssetId("devices_not_found")!} />
            <Text variant="text-lg/semibold" color="text-default">
                Hmmm... could not find that!
            </Text>
        </View>
    );

    // ROUND 15 (Discord 353): the inner ErrorBoundary("AddonPageList")
    // is REMOVED — General (the one page that commits) has no inner
    // boundary, only the CustomPage boundary above the page. One less
    // re-rendering class in the tree; a card throw is now caught by the
    // CustomPage boundary instead (visible ErrorCard, same as before).
    return (
        <>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 8, paddingHorizontal: 12, paddingBottom: 90 }}
            >
                {headerElement}
                {results.length === 0 ? listEmptyElement : results.map((item: any, i: number) => (
                    <View key={String(item.obj?.id ?? item.obj?.name ?? i)}>
                        {i > 0 && <View style={{ height: 8 }} />}
                        <BareRowComponent item={item.obj} result={item} />
                    </View>
                ))}
                {props.ListFooterComponent && <props.ListFooterComponent />}
            </ScrollView>
            {mounted && props.installAction && <FloatingActionButton
                positionBottom={bottomInset + 8}
                icon={findAssetId("PlusLargeIcon")}
                onPress={onInstallPress}
            />}
        </>
    );
}
