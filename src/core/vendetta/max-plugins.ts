// KETTU MAX — built-in plugins, baked into the bundle.
//
// The six plugins below ship INSIDE kettu.min.js (embedded verbatim — the
// .txt files are byte-identical copies of the published plugin builds, see
// the `hash` field of each manifest, which matches the published
// manifest.json). On first launch they are seeded into VdPluginManager's
// plugin storage as installed + enabled, so they work with no network fetch
// and no manual install step. `update: false` keeps the baked-in copy
// authoritative — the plugins are never re-fetched from the web.
//
// If the user removes one of these plugins in the Plugins settings, it stays
// removed: seeding runs exactly once (guarded by the `seeded` flag in the
// KETTU_MAX store, see plugins.ts), never resurrecting a removed plugin.
// If the user already installed one of them manually before the first MAX
// boot, their copy is kept untouched.
//
// To update a baked-in plugin: replace the .txt file with the new published
// build, update its manifest hash below, and bump KETTU_MAX_SEED_VERSION so
// existing installs re-seed the new copy.

import { logger } from "@lib/utils/logger";

import type { VendettaPlugin } from "./plugins";

import catboxJs from "./max-plugins/catbox.txt";
import exportToolsJs from "./max-plugins/export-tools.txt";
import memberDetailsJs from "./max-plugins/member-details.txt";
import messageloggerJs from "./max-plugins/messagelogger.txt";
import timeoutCountdownJs from "./max-plugins/timeout-countdown.txt";
import translateJs from "./max-plugins/translate.txt";

// Bump this when a baked-in plugin's .txt/manifest changes, so existing
// installs pick up the new copy on next launch.
export const KETTU_MAX_SEED_VERSION = 1;

interface MaxPluginEntry {
    id: string;
    manifest: VendettaPlugin["manifest"];
    js: string;
}

const MAX_PLUGINS: MaxPluginEntry[] = [
    {
        id: "https://dolanexeee.github.io/kettu-plugin-messagelogger/",
        manifest: {
            name: "Message Logger",
            description: "Keeps deleted and edited messages visible — deleted messages stay in place in the chat, edits keep their history. View the log in the plugin settings.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "c34b47fe74d6eb167c15a099adf006ade724e4b7aa44f0ab5ad6978e36f6fefb",
        },
        js: messageloggerJs,
    },
    {
        id: "https://dolanexeee.github.io/kettu-plugins/catbox/",
        manifest: {
            name: "Catbox Upload",
            description: "Upload a message attachment or a file from a public URL to Catbox anonymously — permanent link, copied to clipboard.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "4d69b4f7c054362891304514ec2e8c55bceed60f88fd59da48a69f7c3f478919",
        },
        js: catboxJs,
    },
    {
        id: "https://dolanexeee.github.io/kettu-plugins/translate/",
        manifest: {
            name: "Translate Messages",
            description: "Long-press a message (or /translate) to translate it — Arabic to English, English to Arabic, auto direction.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "9e2c1fb0f8762f92bfb94010cee41b019ca465d8fd5f1f77d9820da776f417cc",
        },
        js: translateJs,
    },
    {
        id: "https://dolanexeee.github.io/kettu-plugins/timeout-countdown/",
        manifest: {
            name: "Timeout Countdown",
            description: "/timeoutinfo <user> — shows when a member's timeout ends, with Discord's native live countdown timestamp.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "5dcb8a68d7c8728db95edc2ce16d02f0fbd9bee265f9eb3eeeea910071245f53",
        },
        js: timeoutCountdownJs,
    },
    {
        id: "https://dolanexeee.github.io/kettu-plugins/member-details/",
        manifest: {
            name: "Member Details",
            description: "/userinfo <user> — account creation date (snowflake), account age, server join date, roles.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "40c189d7d71a7ccd162df1ec66e5bacd46f0bd0ff3adb7727c80b1de3e859c59",
        },
        js: memberDetailsJs,
    },
    {
        id: "https://dolanexeee.github.io/kettu-plugins/export-tools/",
        manifest: {
            name: "Export Tools",
            description: "/exportmessages (JSON) and /exportmembers (CSV) — copy loaded channel messages / member list to the clipboard.",
            authors: [{ name: "dolanexeee" }],
            main: "index.js",
            hash: "968e43c1817f86341a7f89831edc3dccb5241d1ece37682cdadedb5f9b9f8d05",
        },
        js: exportToolsJs,
    },
];

/**
 * Seed the baked-in Kettu MAX plugins into the plugin storage.
 * Skips any plugin the user already has (manual install or a previous seed),
 * so a user's own copy — and a user's removal — is never overwritten here.
 * Callers must persist the new seed version after this runs.
 */
export function seedMaxPlugins(plugins: Record<string, VendettaPlugin>) {
    for (const entry of MAX_PLUGINS) {
        if (plugins[entry.id]) continue;
        plugins[entry.id] = {
            id: entry.id,
            manifest: entry.manifest,
            enabled: true,
            update: false,
            js: entry.js,
        };
        logger.log(`Kettu MAX: baked-in plugin installed: ${entry.manifest.name}`);
    }
}
