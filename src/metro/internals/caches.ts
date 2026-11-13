import { diagLog } from "@lib/api/diag";
import { fileExists, readFile, writeFile } from "@lib/api/native/fs";
import { NativeClientInfoModule } from "@lib/api/native/modules";
import { debounce } from "es-toolkit";

import { ModuleFlags, ModulesMapInternal } from "./enums";

const CACHE_VERSION = 102;
const BUNNY_METRO_CACHE_PATH = "caches/metro_modules.json";

type ModulesMap = {
    [flag in number | `_${ModulesMapInternal}`]?: ModuleFlags;
};

let _metroCache = null as unknown as ReturnType<typeof buildInitCache>;

export const getMetroCache = () => _metroCache;

function buildInitCache() {
    const cache = {
        _v: CACHE_VERSION,
        _buildNumber: NativeClientInfoModule.getConstants().Build,
        _modulesCount: Object.keys(window.modules).length,
        flagsIndex: {} as Record<string, number>,
        findIndex: {} as Record<string, ModulesMap | undefined>,
        polyfillIndex: {} as Record<string, ModulesMap | undefined>
    } as const;

    // Force load all modules so useful modules are pre-cached. Add a minor
    // delay so the cache is initialized before the modules are loaded.
    // ROUND 8 (Discord 353): the old single synchronous loop over every
    // module monopolised the JS thread for seconds on a cold cache (fresh
    // install). The storm is scheduled fire-and-forget (never awaited), so
    // it can fire after first render and overlap user interaction; a
    // navigation started in that window — or a first render whose lazy
    // finds hit uninitialised modules while it was pending — leaves the
    // pushed screen black until the JS thread frees up (Plugins page,
    // 12:38; same symptom as round 4, 08:22). Chunk the work with a
    // ~50 ms time budget per macrotask so the thread stays responsive
    // while the cache warms. (ROUND 9: raised from 16 ms — at 16 ms the
    // storm takes so long to finish that the user can open the addon
    // pages while it is still running, and the pages' own finds then do
    // the slow factory-executing scans synchronously. 50 ms still yields
    // regularly and finishes ~3x sooner.)
    setTimeout(() => {
        const ids = Object.keys(window.modules);
        // ROUND 10: log the storm to the diagnostic log (module count +
        // duration) so the on-device warm-up timing is measurable.
        diagLog(`STORM START modules=${ids.length}`);
        const stormStart = Date.now();
        let i = 0;
        const step = () => {
            const deadline = Date.now() + 50;
            while (i < ids.length && Date.now() < deadline) {
                require("./modules").requireModule(ids[i++]);
            }
            if (i < ids.length) setTimeout(step, 0);
            else diagLog(`STORM DONE ms=${Date.now() - stormStart}`);
        };
        step();
    }, 100);

    _metroCache = cache;
    return cache;
}

/** @internal */
export async function initMetroCache() {
    if (!await fileExists(BUNNY_METRO_CACHE_PATH)) return void buildInitCache();
    const rawCache = await readFile(BUNNY_METRO_CACHE_PATH);

    try {
        _metroCache = JSON.parse(rawCache);
        if (_metroCache._v !== CACHE_VERSION) {
            _metroCache = null!;
            throw "cache invalidated; cache version outdated";
        }
        if (_metroCache._buildNumber !== NativeClientInfoModule.getConstants().Build) {
            _metroCache = null!;
            throw "cache invalidated; version mismatch";
        }
        if (_metroCache._modulesCount !== Object.keys(window.modules).length) {
            _metroCache = null!;
            throw "cache invalidated; modules count mismatch";
        }
    } catch {
        buildInitCache();
    }
}

const saveCache = debounce(() => {
    writeFile(BUNNY_METRO_CACHE_PATH, JSON.stringify(_metroCache));
}, 1000);

function extractExportsFlags(moduleExports: any) {
    if (!moduleExports) return undefined;

    const bit = ModuleFlags.EXISTS;
    return bit;
}

/** @internal */
export function indexExportsFlags(moduleId: number, moduleExports: any) {
    const flags = extractExportsFlags(moduleExports);
    if (flags && flags !== ModuleFlags.EXISTS) {
        _metroCache.flagsIndex[moduleId] = flags;
    }
}

/** @internal */
export function indexBlacklistFlag(id: number) {
    _metroCache.flagsIndex[id] |= ModuleFlags.BLACKLISTED;
}

/** @internal */
export function indexAssetModuleFlag(id: number) {
    _metroCache.flagsIndex[id] |= ModuleFlags.ASSET;
}

/** @internal */
export function getCacherForUniq(uniq: string, allFind: boolean) {
    const indexObject = _metroCache.findIndex[uniq] ??= {};

    return {
        cacheId(moduleId: number, exports: any) {
            indexObject[moduleId] ??= extractExportsFlags(exports);

            saveCache();
        },
        // Finish may not be called by single find
        finish(notFound: boolean) {
            if (allFind) indexObject[`_${ModulesMapInternal.FULL_LOOKUP}`] = 1;
            if (notFound) indexObject[`_${ModulesMapInternal.NOT_FOUND}`] = 1;

            saveCache();
        }
    };
}

/** @internal */
export function getPolyfillModuleCacher(name: string) {
    const indexObject = _metroCache.polyfillIndex[name] ??= {};

    return {
        getModules() {
            return require("@metro/internals/modules").getCachedPolyfillModules(name);
        },
        cacheId(moduleId: number) {
            indexObject[moduleId] = 1;
            saveCache();
        },
        finish() {
            indexObject[`_${ModulesMapInternal.FULL_LOOKUP}`] = 1;
            saveCache();
        }
    };
}
