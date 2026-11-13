import { lazyDestructure } from "@lib/utils/lazy";
import { findByFilePathLazy, findByProps, findByPropsLazy } from "@metro/wrappers";
import { Linking } from "react-native";
import type { Dispatcher } from "./types/flux";

export * as components from "./components";

// Discord
export const constants = findByPropsLazy("Fonts", "Permissions");
export const channels = findByPropsLazy("getVoiceChannelId");
export const i18n = findByPropsLazy("Messages");

export const clipboard = findByPropsLazy("setString", "getString", "hasString");
export const assets = findByPropsLazy("registerAsset");
export const invites = findByPropsLazy("acceptInviteAndTransitionToInviteChannel");
export const commands = findByPropsLazy("getBuiltInCommands");
export const navigation = findByPropsLazy("pushLazy");
export const toasts = findByFilePathLazy("modules/toast/native/ToastActionCreators.tsx", true);
export const messageUtil = findByPropsLazy("sendBotMessage");
export const navigationStack = findByPropsLazy("createStackNavigator");
export const NavigationNative = findByPropsLazy("NavigationContainer");
export const semver = findByPropsLazy("parse", "clean");

export const tokens = findByPropsLazy("unsafe_rawColors", "colors");
export const { useToken } = lazyDestructure(() => findByProps("useToken"));

// Polyfill LinkingUtils

const openURL = (url: string) => Linking.openURL(url);
export const url = nativeModuleProxy.NativeLinkingModule || nativeModuleProxy.DCDLinkingManager ? {
    openURL,
    openDeeplink: openURL,
    handleSupportedURL: openURL,
    isDiscordConnectOauth2Deeplink: () => {
        console.warn("url.isDiscordConnectOauth2Deeplink is not implemented and will always return false");
        return false;
    },
    showLongPressUrlActionSheet: () => console.warn("url.showLongPressUrlActionSheet is not implemented"),
    handleMessageLinking: findByFilePathLazy("modules/links/native/handleContentLinking.tsx", true),
} : findByPropsLazy("openURL", "openDeeplink");

// Flux
export const Flux = findByPropsLazy("connectStores");
// TODO: Making this a proxy/lazy fuck things up for some reason
// ROUND 9 (Discord 353, Message Logger dead on a cold cache): the old
// single-prop filter ("_interceptors") is too weak — on a cold cache the
// full scan returns the LOWEST module id exporting that prop, which need
// not be the real dispatcher, so the Logger (and the core flux
// interceptor) silently installed on the wrong object and never saw a
// dispatch. The real dispatcher also exports dispatch/register/subscribe,
// so require all four — that combination is unique to it. (On a warm
// cache the findIndex returned the previously-resolved correct id, which
// is why the Logger worked at 10:35 and died on the fresh install.)
export const FluxDispatcher = findByProps("dispatch", "_interceptors", "register", "subscribe") as Dispatcher;
export const FluxUtils = findByProps("useStateFromStores");

// React
export const React = window.React = findByPropsLazy("createElement") as typeof import("react");
export const ReactNative = window.ReactNative = findByPropsLazy("AppRegistry") as typeof import("react-native");
