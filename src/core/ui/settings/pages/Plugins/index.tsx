import { Strings } from "@core/i18n";
import AddonPage from "@core/ui/components/AddonPage";
import PluginCard from "@core/ui/settings/pages/Plugins/components/PluginCard";
import { VdPluginManager } from "@core/vendetta/plugins";
import { useProxy } from "@core/vendetta/storage";
import { isCorePlugin, isPluginInstalled, pluginSettings, registeredPlugins, corePluginInstances } from "@lib/addons/plugins";
import { Author } from "@lib/addons/types";
import { findAssetId } from "@lib/api/assets";
import { diagFlushNow, diagLog } from "@lib/api/diag";
import { settings } from "@lib/api/settings";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { BUNNY_PROXY_PREFIX, VD_PROXY_PREFIX } from "@lib/utils/constants";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByProps } from "@metro";
import { NavigationNative } from "@metro/common";
import {
  Button,
  Card,
  IconButton,
  Text,
} from "@metro/common/components";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";

import { UnifiedPluginModel } from "./models";
import unifyBunnyPlugin from "./models/bunny";
import unifyVdPlugin from "./models/vendetta";

const { openAlert } = lazyDestructure(() =>
  findByProps("openAlert", "dismissAlert"),
);
const { AlertModal, AlertActions, AlertActionButton } = lazyDestructure(() =>
  findByProps("AlertModal", "AlertActions"),
);

export default function Plugins() {
  // ROUND 11 (diagnostic): render-start marker, flushed immediately.
  // If this line is absent while CUSTOMPAGE RENDER is present, the
  // screen mounted but Plugins never rendered.
  try { diagLog("PLUGINS RENDER START"); diagFlushNow(); } catch { /* ignore */ }
  useProxy(settings);
  const navigation = NavigationNative.useNavigation();

  // ROUND 15 (Discord 353): the item computation used to live in a
  // `useItems` render-prop callback invoked from a separate PluginPage
  // component — the hooks attached to PluginPage's fiber, and the rd
  // logs showed the render dying between PLUGINPAGE RENDER START and
  // USEITEMS START on every re-render. The computation now lives here,
  // at the top level of the owning component, computed inline on every
  // render (0-2 ms, same as before) and passed down as a plain array.
  // There is no intermediate component left between Plugins and
  // AddonPage.
  useProxy(VdPluginManager.plugins);
  useObservable([pluginSettings]);

  // ROUND 10: diagnostic marker — this effect only runs if the page's
  // render commits. If the screen stays black and this line never appears
  // in kettu-diag.log, the render never committed (finds still blocking).
  useEffect(() => { diagLog("PLUGINS PAGE MOUNTED"); }, []);

  // ROUND 13 (diagnostic): proves the render got past the hooks to the
  // return. If HOOKS DONE is absent while RENDER START is present, the
  // render aborted inside the hooks themselves.
  try { diagLog("PLUGINS HOOKS DONE"); diagFlushNow(); } catch { /* ignore */ }

  // ROUND 15: items computed inline (was: useItems render-prop).
  const _t0 = Date.now();
  const corePlugins = [...registeredPlugins.values()].filter(p => isPluginInstalled(p.id) && isCorePlugin(p.id)).map(unifyBunnyPlugin);
  const vdPlugins = Object.values(VdPluginManager.plugins).map(unifyVdPlugin);
  const bnPlugins = [...registeredPlugins.values()].filter(p => isPluginInstalled(p.id) && !isCorePlugin(p.id)).map(unifyBunnyPlugin);
  const items = [...corePlugins, ...vdPlugins, ...bnPlugins];
  try { diagLog(`PLUGINS ITEMS n=${items.length} ms=${Date.now() - _t0}`); diagFlushNow(); } catch { /* ignore */ }

  return (
    <AddonPage<UnifiedPluginModel>
      CardComponent={PluginCard}
      title={Strings.PLUGINS}
      searchKeywords={[
        "name",
        "description",
        (p) =>
          p.authors
            ?.map((a: Author | string) => (typeof a === "string" ? a : a.name))
            .join() || "",
      ]}
      sortOptions={{
        "Name (A-Z)": (a, b) => a.name.localeCompare(b.name),
        "Name (Z-A)": (a, b) => b.name.localeCompare(a.name),
      }}
      safeModeHint={{ message: Strings.SAFE_MODE_NOTICE_PLUGINS }}
      items={items}
      ListHeaderComponent={() => {
            const unproxiedPlugins = Object.values(VdPluginManager.plugins).filter(p => !p.id.startsWith(VD_PROXY_PREFIX) && !p.id.startsWith(BUNNY_PROXY_PREFIX));
            if (!unproxiedPlugins.length) return null;

        return (
          <View style={{ marginVertical: 12, marginHorizontal: 10 }}>
            <Card border="strong">
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                  flexDirection: "row",
                }}
              >
                <View style={{ gap: 6, flexShrink: 1 }}>
                  <Text variant="heading-md/bold">Unproxied Plugins Found</Text>
                  <Text variant="text-sm/medium" color="text-muted">
                    Plugins installed from unproxied sources may run unverified
                    code in this app without your awareness.
                  </Text>
                </View>
                <View style={{ marginLeft: "auto" }}>
                  <IconButton
                    size="sm"
                    variant="secondary"
                    icon={findAssetId("CircleInformationIcon-primary")}
                    style={{ marginLeft: 8 }}
                    onPress={() => {
                      navigation.push("PUPU_CUSTOM_PAGE", {
                        title: "Unproxied Plugins",
                        // ROUND 15: was FlashList (same native-list
                        // component as the exonerated AddonPage list).
                        // Plain ScrollView + map — only reached on tap.
                        render: () => {
                          return (
                            <ScrollView
                              contentContainerStyle={{ padding: 8 }}
                            >
                              {unproxiedPlugins.map((p: any) => (
                                <View key={String(p.id)} style={{ marginBottom: 8 }}>
                                  <Card>
                                    <Text variant="heading-md/semibold">
                                      {p.id}
                                    </Text>
                                  </Card>
                                </View>
                              ))}
                            </ScrollView>
                          );
                        },
                      });
                    }}
                  />
                </View>
              </View>
            </Card>
          </View>
        );
      }}
      installAction={{
        label: "Install a plugin",
        fetchFn: async (url: string) => {
          if (
            !url.startsWith(VD_PROXY_PREFIX) &&
            !url.startsWith(BUNNY_PROXY_PREFIX) &&
            !settings.developerSettings
          ) {
            openAlert(
              "bunny-plugin-unproxied-confirmation",
              <AlertModal
                title="Hold On!"
                content="You're trying to install a plugin from an unproxied external source. This means you're trusting the creator to run their code in this app without your knowledge. Are you sure you want to continue?"
                extraContent={
                  <Card>
                    <Text variant="text-md/bold">{url}</Text>
                  </Card>
                }
                actions={
                  <AlertActions>
                    <AlertActionButton
                      text="Continue"
                      variant="primary"
                      onPress={() => {
                        VdPluginManager.installPlugin(url)
                          .then(() =>
                            showToast(
                              Strings.TOASTS_INSTALLED_PLUGIN,
                              findAssetId("Check"),
                            ),
                          )
                          .catch((e) =>
                            openAlert(
                              "bunny-plugin-install-failed",
                              <AlertModal
                                title="Install Failed"
                                content={`Unable to install plugin from '${url}':`}
                                extraContent={
                                  <Card>
                                    <Text variant="text-md/normal">
                                      {e instanceof Error
                                        ? e.message
                                        : String(e)}
                                    </Text>
                                  </Card>
                                }
                                actions={
                                  <AlertActionButton
                                    text="Okay"
                                    variant="primary"
                                  />
                                }
                              />,
                            ),
                          );
                      }}
                    />
                    <AlertActionButton text="Cancel" variant="secondary" />
                  </AlertActions>
                }
              />,
            );
          } else {
            return await VdPluginManager.installPlugin(url);
          }
        },
      }}
    />
  );
}
