import { VdPluginManager } from "@core/vendetta/plugins";
import { useProxy } from "@core/vendetta/storage";
import { isCorePlugin, isPluginInstalled, pluginSettings, registeredPlugins } from "@lib/addons/plugins";
import { diagFlushNow, diagLog } from "@lib/api/diag";
import { settings } from "@lib/api/settings";
import { useObservable } from "@lib/api/storage";
import { NavigationNative } from "@metro/common";
import { Text } from "@metro/common/components";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";

import { UnifiedPluginModel } from "./models";
import unifyBunnyPlugin from "./models/bunny";
import unifyVdPlugin from "./models/vendetta";

export default function Plugins() {
  // ROUND 11 (diagnostic): render-start marker, flushed immediately.
  // If this line is absent while CUSTOMPAGE RENDER is present, the
  // screen mounted but Plugins never rendered.
  try { diagLog("PLUGINS RENDER START"); diagFlushNow(); } catch { /* ignore */ }
  useProxy(settings);
  // ROUND 16 (diagnostic): per-hook markers — the rf logs showed the
  // re-renders aborting between PLUGINS RENDER START and PLUGINS HOOKS
  // DONE, i.e. inside one of these four hooks, with no throw ever
  // caught by any boundary. These markers name the exact hook.
  try { diagLog("PLUGINS HOOK settings OK"); diagFlushNow(); } catch { /* ignore */ }
  const navigation = NavigationNative.useNavigation();
  try { diagLog("PLUGINS HOOK nav OK"); diagFlushNow(); } catch { /* ignore */ }
  useProxy(VdPluginManager.plugins);
  try { diagLog("PLUGINS HOOK plugins OK"); diagFlushNow(); } catch { /* ignore */ }
  useObservable([pluginSettings]);
  try { diagLog("PLUGINS HOOK observable OK"); diagFlushNow(); } catch { /* ignore */ }

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

  // ROUND 16 (Discord 353): BARE-PAGE SPLIT. The rf logs proved the
  // full pass reaches ADDONPAGE RESULTS n=10 but the first PluginCard
  // never renders, and the re-renders abort inside the hooks above —
  // with Search gone, PluginPage gone, and the renderer stabilized.
  // This minimal page keeps the same hooks + items computation but
  // renders plain Text rows instead of AddonPage + PluginCard, so the
  // next log splits cards from container: if it mounts, the cards (or
  // the AddonPage list) are the blocker; if it still loops with the
  // same hook-abort signature, the blocker is in the hooks/navigation
  // layer itself. Tap a row to toggle that plugin (core plugins are
  // not toggleable, same as before).
  try { diagLog(`PLUGINS BARE ROWS n=${items.length}`); diagFlushNow(); } catch { /* ignore */ }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12 }}
    >
      {items.map((p: UnifiedPluginModel) => {
        const core = isCorePlugin(p.id);
        return (
          <View key={String(p.id)} style={{ paddingVertical: 10 }}>
            <Text
              variant="heading-md/semibold"
              onPress={core ? undefined : () => p.toggle(!p.isEnabled())}
            >
              {p.name}
            </Text>
            <Text variant="text-sm/medium" color="text-muted">
              {String(p.id)} — {p.isEnabled() ? "enabled" : "disabled"}{core ? " (core)" : ""}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
