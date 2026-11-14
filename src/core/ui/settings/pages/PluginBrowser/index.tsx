import { React, NavigationNative } from "@metro/common";
import { Pressable, RefreshControl, ScrollView, Text as RNText, View } from "react-native";
import { AlertActions, AlertModal, Text } from "@metro/common/components";
import { diagFlushNow, diagLog } from "@lib/api/diag";
import safeFetch from "@lib/utils/safeFetch";
import { showToast } from "@ui/toasts";
import { VdPluginManager } from "@core/vendetta/plugins";
import { AlertActionButton } from "@lib/ui/components/wrappers";
import { installTheme, themes, removeTheme } from "@lib/addons/themes";
import { dismissAlert, openAlert } from "@lib/ui/alerts";

interface BaseAddonData {
    name: string;
    description: string;
    authors: string[];
    installUrl: string;
}

interface PluginData extends BaseAddonData {
    status: "working" | "broken" | "warning" | string;
    sourceUrl: string;
    warningMessage?: string;
}

interface ThemeData extends BaseAddonData {}

type AddonData = PluginData | ThemeData;

const PLUGIN_URL = "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/refs/heads/main/src/plugins-data.json";
const THEME_URL = "https://raw.githubusercontent.com/kmmiio99o/theme-marketplace/refs/heads/main/themes.json";

function normalizeIdFromInstallUrl(url: string) {
    return url.endsWith("/") ? url : url + "/";
}

// @ts-ignore (i cant be bothered to type these)
function InstallButton({ addon, isPluginMode, installing, setInstalling, setRefreshTick }) {
    const normId = normalizeIdFromInstallUrl(addon.installUrl);
    const [installed, setInstalled] = React.useState(() =>
        isPluginMode ? Boolean(VdPluginManager.plugins[normId]) : Boolean(themes[addon.installUrl])
    );

    React.useEffect(() => {
        setInstalled(isPluginMode ? Boolean(VdPluginManager.plugins[normId]) : Boolean(themes[addon.installUrl]));
    }, [addon.installUrl, setRefreshTick, isPluginMode]);

    const installAddon = async () => {
        if (installing.has(normId)) return;
        setInstalling((prev: Iterable<unknown> | null | undefined) => new Set(prev).add(normId));
        try {
            if (isPluginMode) {
                await VdPluginManager.installPlugin(normId, true);
            } else {
                await installTheme(addon.installUrl);
            }
            showToast(`Installed ${addon.name}`);
            setInstalled(true);
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e));
        } finally {
            setInstalling((prev: Iterable<unknown> | null | undefined) => { const s = new Set(prev); s.delete(normId); return s; });
            setRefreshTick((t: number) => t + 1);
        }
    };

    const uninstallAddon = async () => {
        try {
            if (isPluginMode) {
                await VdPluginManager.removePlugin(normId);
            } else {
                await removeTheme(addon.installUrl);
            }
            showToast(`Uninstalled ${addon.name}`);
            setInstalled(false);
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e));
        } finally {
            setRefreshTick((t: number) => t + 1);
        }
    };

    const promptInstall = () => {
        if (!isPluginMode) return installAddon();

        const plugin = addon as PluginData;
        const needsWarn = (plugin.status && plugin.status !== "working") || (plugin.warningMessage && plugin.warningMessage.trim().length > 0);
        if (!needsWarn) return installAddon();

        const lines: string[] = [];
        if (plugin.status && plugin.status !== "working") {
            if (plugin.status === "broken") lines.push("This plugin is marked as broken, please be aware you may encounter issues");
            else if (plugin.status === "warning") lines.push("This plugin may have issues");
            else lines.push(`Status: ${plugin.status}`);
        }
        if (plugin.warningMessage) lines.push(plugin.warningMessage);

        openAlert("plugins-list-install-warning", (
            <AlertModal
                title="Warning!"
                content="This plugin may not work as expected."
                extraContent={<Text variant="text-sm/normal" color="text-muted">{lines.join("\n\n")}</Text>}
                actions={<AlertActions>
                    <AlertActionButton
                        text="Install Anyway"
                        variant="primary"
                        onPress={() => { dismissAlert("plugins-list-install-warning"); installAddon(); }}
                    />
                    <AlertActionButton
                        text="Cancel"
                        variant="secondary"
                        onPress={() => dismissAlert("plugins-list-install-warning")}
                    />
                </AlertActions>}
            />
        ));
    };

    // ROUND 17 (Discord 353): bare InstallButton — plain Pressable + RN
    // Text. The @metro Button + findAssetId icons are deferred until the
    // bare page commits (same split as round 16's Plugins page).
    const busy = installing.has(normId);
    return (
        <Pressable
            onPress={busy ? undefined : (!installed ? promptInstall : uninstallAddon)}
            disabled={busy}
            style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: !installed ? "#5865F2" : "#DA373C",
                opacity: busy ? 0.6 : 1
            }}
        >
            <RNText style={{ color: "#FFFFFF", fontWeight: "600" }}>
                {!installed ? (busy ? "Installing..." : "Install") : "Uninstall"}
            </RNText>
        </Pressable>
    );
}

// @ts-ignore (i cant be bothered to type these)
function AddonCard({ addon, isPluginMode, installing, setInstalling, setRefreshTick }) {
    const { name, description, authors } = addon;
    const plugin = addon as PluginData;

    // ROUND 17 (Discord 353): bare AddonCard — plain View + RN Text rows.
    // The @metro Card/Stack/Text, the IconButton menu and the copy-link
    // actions are deferred until the bare page commits. Status colors
    // kept verbatim from the full card.
    let statusColor = "#B5BAC1";
    if (isPluginMode) {
        if (plugin.status === "working") statusColor = "#4ADE80";
        if (plugin.status === "broken") statusColor = "#EF4444";
        if (plugin.status === "warning") statusColor = "#F59E0B";
    }

    return (
        <View style={{ padding: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexShrink: 1 }}>
                    <RNText numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>
                        {name}
                    </RNText>
                    <RNText style={{ color: "#B5BAC1", fontSize: 13 }}>
                        by {authors?.join(", ") || "Unknown"}
                    </RNText>
                    {isPluginMode && (
                        <RNText style={{ color: statusColor, fontSize: 13, fontWeight: "600" }}>
                            Status: {plugin.status}
                        </RNText>
                    )}
                </View>
                <InstallButton
                    addon={addon}
                    isPluginMode={isPluginMode}
                    installing={installing}
                    setInstalling={setInstalling}
                    setRefreshTick={setRefreshTick}
                />
            </View>
            <RNText style={{ color: "#DBDEE1", fontSize: 14, marginTop: 8 }}>
                {description}
            </RNText>
            {isPluginMode && plugin.warningMessage && (
                <RNText style={{ color: "#B5BAC1", fontSize: 13, marginTop: 6 }}>
                    Warning: {plugin.warningMessage}
                </RNText>
            )}
        </View>
    );
}

enum Sort {
    DateNewest = "Newest",
    DateOldest = "Oldest",
    NameAZ = "Name (A–Z)",
    NameZA = "Name (Z–A)",
    WorkingFirst = "Working First",
    BrokenFirst = "Broken First",
}

const SORT_ORDER: Sort[] = [
    Sort.DateNewest,
    Sort.DateOldest,
    Sort.NameAZ,
    Sort.NameZA,
    Sort.WorkingFirst,
    Sort.BrokenFirst,
];

export default function BrowserPage() {
    // ROUND 17 (diagnostic): render-start marker, flushed immediately.
    // If this line is absent while CUSTOMPAGE RENDER is present, the
    // abort happens before/at BrowserPage's entry (renderer/boundary
    // layer — a new lead, see ROUND17-DIAGNOSIS §5).
    try { diagLog("BROWSER RENDER START"); diagFlushNow(); } catch { /* ignore */ }
    const navigation = NavigationNative.useNavigation();

    const [mode, setMode] = React.useState<"plugins" | "themes">("plugins");
    const [plugins, setPlugins] = React.useState<PluginData[]>([]);
    const [themesList, setThemesList] = React.useState<ThemeData[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    // ROUND 15 (Discord 353): the search UI is REMOVED.
    // searchQuery stays "" so filterList returns the full list.
    const [searchQuery] = React.useState("");
    const [installing, setInstalling] = React.useState<Set<string>>(new Set());
    const [refreshTick, setRefreshTick] = React.useState(0);
    const [sort, setSort] = React.useState<Sort>(Sort.DateNewest);

    React.useEffect(() => {
        navigation.setOptions({
            title: "Browser"
        });
    }, [navigation]);

    // ROUND 14 (fix verification): proves the page committed — effects run
    // only after commit. If this line is absent on-device, the commit is
    // still blocked even with the ScrollView list.
    // ROUND 15: also gates the RefreshControl below — it only renders
    // after the first commit, so a native-view problem in it can no
    // longer block the initial commit.
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        try { diagLog("ADDONBROWSER MOUNTED"); diagFlushNow(); } catch { /* ignore */ }
        setMounted(true);
    }, []);

    const fetchData = React.useCallback(async (isPluginMode: boolean) => {
        const modeName = isPluginMode ? "plugins" : "themes";
        setLoading(true);
        setError(null);
        try {
            // ROUND 17 (diagnostic): fetch markers — the rg log could not
            // distinguish "fetch failed" from "cards didn't render" if the
            // page mounts but shows nothing.
            try { diagLog(`BROWSER FETCH START mode=${modeName}`); diagFlushNow(); } catch { /* ignore */ }
            const url = isPluginMode ? PLUGIN_URL : THEME_URL;
            const response = await safeFetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();

            let addonList: AddonData[] = [];
            if (Array.isArray(data)) {
                addonList = data;
            } else if (isPluginMode && data.OFFICIAL_PLUGINS) {
                addonList = data.OFFICIAL_PLUGINS;
            } else if (!isPluginMode) {
                // Handle any other structure for themes - try common property names
                addonList = data.OFFICIAL_THEMES || data.themes || data.THEMES || data.items || [];
            }

            if (isPluginMode) {
                setPlugins(addonList as PluginData[]);
            } else {
                setThemesList(addonList as ThemeData[]);
            }
            try { diagLog(`BROWSER FETCH OK mode=${modeName} n=${addonList.length}`); diagFlushNow(); } catch { /* ignore */ }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            try { diagLog(`BROWSER FETCH FAIL mode=${modeName} err=${msg}`); diagFlushNow(); } catch { /* ignore */ }
            setError(msg);
            if (isPluginMode) {
                setPlugins([]);
            } else {
                setThemesList([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchPlugins = React.useCallback(() => fetchData(true), [fetchData]);
    const fetchThemes = React.useCallback(() => fetchData(false), [fetchData]);

    React.useEffect(() => {
        fetchPlugins();
        fetchThemes();
    }, [fetchPlugins, fetchThemes]);

    const filterList = (list: AddonData[]) => {
        if (!list) return [] as AddonData[];
        const q = searchQuery.toLowerCase();
        if (!q) return list;
        return list.filter(p =>
            p.name.toLowerCase().includes(q)
            || p.description.toLowerCase().includes(q)
            || (p.authors || []).some(a => a.toLowerCase().includes(q))
        );
    };

    const sortedAndFiltered = React.useMemo(() => {
        const list = filterList(mode === "plugins" ? plugins : themesList);

        const getStatusPriority = (status: PluginData["status"], sortBy: Sort): number => {
            if (sortBy === Sort.WorkingFirst) {
                return status === "working" || status === "warning" ? 0 : 1;
            }
            if (sortBy === Sort.BrokenFirst) {
                return status === "broken" ? 0 : 1;
            }
            return 0;
        };

        switch (sort) {
            case Sort.DateNewest:
                return [...list].reverse();
            case Sort.DateOldest:
                return [...list];
            case Sort.NameAZ:
                return [...list].sort((a, b) => a.name.localeCompare(b.name));
            case Sort.NameZA:
                return [...list].sort((a, b) => b.name.localeCompare(a.name));
            case Sort.WorkingFirst:
                if (mode === "plugins") {
                    return [...list].sort((a, b) => {
                        const pa = getStatusPriority((a as PluginData).status, Sort.WorkingFirst);
                        const pb = getStatusPriority((b as PluginData).status, Sort.WorkingFirst);
                        return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
                    });
                }
                return list;
            case Sort.BrokenFirst:
                if (mode === "plugins") {
                    return [...list].sort((a, b) => {
                        const pa = getStatusPriority((a as PluginData).status, Sort.BrokenFirst);
                        const pb = getStatusPriority((b as PluginData).status, Sort.BrokenFirst);
                        return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
                    });
                }
                return list;
            default:
                return list;
        }
    }, [plugins, themesList, mode, searchQuery, sort]);

    // ROUND 17 (diagnostic): proves the render got past the hooks to the
    // return. If RENDER START is present but HOOKS DONE is absent, the
    // render aborted inside the hooks themselves.
    try { diagLog("BROWSER HOOKS DONE"); diagFlushNow(); } catch { /* ignore */ }

    if (error) {
        // ROUND 17: error branch is bare too — plain View + RN Text +
        // Pressable. It only renders post-commit (fetch runs in an
        // effect), but there is no reason to keep @metro in this file's
        // render paths at all while the split is being proven.
        return (
            <View style={{ flex: 1, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" }}>
                <View style={{ gap: 8, alignItems: "center" }}>
                    <RNText style={{ textAlign: "center", color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
                        An error occurred while fetching the repository
                    </RNText>
                    <RNText style={{ textAlign: "center", color: "#B5BAC1", fontSize: 14 }}>
                        {error}
                    </RNText>
                    <Pressable
                        onPress={() => fetchData(mode === "plugins")}
                        style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#5865F2", marginTop: 8 }}
                    >
                        <RNText style={{ color: "#FFFFFF", fontWeight: "600" }}>Refetch</RNText>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ROUND 17 (Discord 353): BARE-PAGE SPLIT, mirroring round 16's
    // Plugins split. Diag-7 proved BrowserPage NEVER renders (no
    // ADDONBROWSER MOUNTED, CustomPage retries navId 9→11) while the
    // bare Plugins page mounts in ~40 ms. By elimination (§3 of
    // ROUND17-DIAGNOSIS), the only @metro components in BrowserPage's
    // first paint that appear in NO committing page's first paint are
    // Card and IconButton — so this first paint uses plain RN
    // primitives ONLY: View + ScrollView + Pressable + RN Text.
    // Mode buttons → Pressable + Text. Sort IconButton → Pressable +
    // Text that cycles the sort order (the action sheet is deferred).
    // Warning Card → plain View + Text. AddonCard → plain View + Text
    // rows with Install/Uninstall as Pressable + Text. The copy-link
    // menu is deferred with the cards. Fetch logic unchanged.
    const cycleSort = () => {
        const idx = SORT_ORDER.indexOf(sort);
        setSort(SORT_ORDER[(idx + 1) % SORT_ORDER.length]);
    };

    return (
        <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 10 }}>
                <View style={{ flexDirection: "row", paddingTop: 10 }}>
                    <Pressable
                        onPress={() => setMode("plugins")}
                        style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: mode === "plugins" ? "#5865F2" : "rgba(255,255,255,0.06)" }}
                    >
                        <RNText style={{ color: "#FFFFFF", fontWeight: "600" }}>Plugins</RNText>
                    </Pressable>
                    <View style={{ width: 8 }} />
                    <Pressable
                        onPress={() => setMode("themes")}
                        style={{ flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: mode === "themes" ? "#5865F2" : "rgba(255,255,255,0.06)" }}
                    >
                        <RNText style={{ color: "#FFFFFF", fontWeight: "600" }}>Themes</RNText>
                    </Pressable>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 6, paddingTop: 8 }}>
                    <Pressable
                        onPress={cycleSort}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)" }}
                    >
                        <RNText style={{ color: "#DBDEE1", fontWeight: "600" }}>Sort: {sort}</RNText>
                    </Pressable>
                </View>
            </View>

            {/* ROUND 14 (Discord 353): FlashList never commits on 353 for
                these pages (rd logs: full render, no mount/fetch effect).
                Plain ScrollView + map renders the same cards through plain
                Views. Pull-to-refresh is preserved via RefreshControl. */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 90, paddingHorizontal: 5 }}
                refreshControl={
                    mounted ? (
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={mode === "plugins" ? fetchPlugins : fetchThemes}
                    />
                    ) : undefined
                }
            >
                {mode === "plugins" ? (
                    <View style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                        <View style={{ padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 10 }}>
                            <View style={{ gap: 6 }}>
                                <RNText style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>Unproxied Plugins</RNText>
                                <RNText style={{ color: "#B5BAC1", fontSize: 14 }}>
                                    Plugins installed from this source have not been checked for safety, install at your own risk
                                </RNText>
                            </View>
                        </View>
                    </View>
                ) : null}
                {sortedAndFiltered.map((addon: any) => (
                    <View key={String(addon.installUrl ?? addon.name)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                        <AddonCard
                            addon={addon}
                            isPluginMode={mode === "plugins"}
                            installing={installing}
                            setInstalling={setInstalling}
                            setRefreshTick={setRefreshTick}
                        />
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
