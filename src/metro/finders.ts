import { diagLog } from "@lib/api/diag";
import { getCacherForUniq } from "./internals/caches";
import { getModules, requireModule } from "./internals/modules";
import { FilterFn } from "./types";

// ROUND 10 — single-pass warm registry.
//
// The ROUND 9 warm-up touched ~36 lazy proxies one per macrotask; each
// touch is a full cold-cache module scan, so the warm-up needs tens of
// seconds — the user opens Plugins within seconds, so the page's first
// render still did ~15-20 synchronous cold scans (black screen). The fix
// is to warm every filter in ONE pass over the registry (below), so the
// warm-up costs one scan instead of ~36.
//
// Filters register themselves when they are created: createLazyModule
// (metro/lazy.ts) and the findProp/findSingular helpers
// (metro/common/components.ts) call registerWarmFilter. Filters created
// lazily inside closures (lazyDestructure factories) are registered
// explicitly in lib/api/warmFinds.ts. The findIndex is keyed by the
// filter's uniq string, so warming a uniq warms every proxy that uses it.
const _warmFilters = new Map<string, FilterFn<any>>();

/** Register a Metro filter so the single-pass warm can populate its findIndex entry. */
export function registerWarmFilter<A extends unknown[]>(filter: FilterFn<A>): void {
    try {
        if (filter?.uniq) _warmFilters.set(filter.uniq, filter as FilterFn<any>);
    } catch {
        // Never break filter creation for warming.
    }
}

export function getWarmFilters(): FilterFn<any>[] {
    return [..._warmFilters.values()];
}

export interface WarmResult {
    filters: number;
    warmed: number;
    notFound: number;
    scanned: number;
    ms: number;
}

/**
 * ROUND 10 — single-pass warm: iterate the module registry ONCE, testing
 * every registered filter per module, and populate the findIndex for all
 * matches. One scan instead of one scan per filter. Chunked by time
 * budget so the JS thread stays responsive while it runs.
 */
export function warmFiltersAsync(filters: FilterFn<any>[], sliceMs = 100): Promise<WarmResult> {
    return new Promise((resolve) => {
        const started = Date.now();
        const pending = new Map<string, FilterFn<any>>(filters.map(f => [f.uniq, f]));
        const cachers = new Map<string, ReturnType<typeof getCacherForUniq>>();
        for (const f of filters) {
            try { cachers.set(f.uniq, getCacherForUniq(f.uniq, false)); } catch { /* ignore */ }
        }
        // Fresh uniq: getModules yields the full registry (no cached ids to skip).
        const gen = getModules("__bunny_warm__", false);
        let scanned = 0;
        const finish = () => {
            for (const [uniq] of pending) {
                try { cachers.get(uniq)?.finish(true); } catch { /* ignore */ }
            }
            resolve({ filters: filters.length, warmed: filters.length - pending.size, notFound: pending.size, scanned, ms: Date.now() - started });
        };
        const step = () => {
            try {
                const deadline = Date.now() + sliceMs;
                while (true) {
                    const next = gen.next();
                    if (next.done) { finish(); return; }
                    const [id, moduleExports] = next.value as [number, any];
                    scanned++;
                    for (const [uniq, filter] of pending) {
                        let testedExports: any;
                        try {
                            ({ exports: testedExports } = filterExports(moduleExports, id, filter));
                        } catch { continue; }
                        if (testedExports !== undefined) {
                            try { cachers.get(uniq)?.cacheId(id, testedExports); } catch { /* ignore */ }
                            pending.delete(uniq);
                        }
                    }
                    if (pending.size === 0) { finish(); return; }
                    if (Date.now() >= deadline) break;
                }
            } catch { finish(); return; }
            setTimeout(step, 0);
        };
        step();
    });
}

function filterExports<A extends unknown[]>(
    moduleExports: any,
    moduleId: number,
    filter: FilterFn<A>,
) {
    if (
        moduleExports.default &&
        moduleExports.__esModule &&
        filter(moduleExports.default, moduleId, true)
    ) {
        return {
            exports: filter.raw ? moduleExports : moduleExports.default,
            defaultExport: !filter.raw
        };
    }

    if (!filter.raw && filter(moduleExports, moduleId, false)) {
        return { exports: moduleExports, defaultExport: false };
    }

    return {};
}

/**
 * Returns the [id, defaultExports] of the first module where filter returns non-undefined, and undefined otherwise.
 * @param filter find calls filter once for each enumerable module's exports until it finds one where filter returns a thruthy value.
 */
export function findModule<A extends unknown[]>(filter: FilterFn<A>) {
    // ROUND 10: log slow finds (>100 ms) to the diagnostic log so the
    // on-device timings are measurable. A find that hits the findIndex
    // returns in <1 ms; a cold-cache full scan takes seconds. Guarded so
    // logging can never break a find.
    const t0 = Date.now();
    const { cacheId, finish } = getCacherForUniq(filter.uniq, false);

    for (const [id, moduleExports] of getModules(filter.uniq, false)) {
        const { exports: testedExports, defaultExport } = filterExports(
            moduleExports,
            id,
            filter,
        );
        if (testedExports !== undefined) {
            cacheId(id, testedExports);
            const ms = Date.now() - t0;
            if (ms > 100) { try { diagLog(`SLOW FIND ${filter.uniq} ${ms}ms HIT id=${id}`); } catch { /* ignore */ } }
            return { id, defaultExport };
        }
    }

    finish(true);
    const ms = Date.now() - t0;
    if (ms > 100) { try { diagLog(`SLOW FIND ${filter.uniq} ${ms}ms MISS`); } catch { /* ignore */ } }
    return {};
}

/**
 * Returns the id of the first module where filter returns non-undefined, and undefined otherwise.
 * @param filter find calls filter once for each enumerable module's exports until it finds one where filter returns a thruthy value.
 */
export function findModuleId<A extends unknown[]>(filter: FilterFn<A>) {
    return findModule(filter)?.id;
}

/**
 * Returns the exports of the first module where filter returns non-undefined, and undefined otherwise.
 * @param filter find calls filter once for each enumerable module's exports until it finds one where filter returns a thruthy value.
 */
export function findExports<A extends unknown[]>(filter: FilterFn<A>) {
    const { id, defaultExport } = findModule(filter);
    if (id == null) return;

    return defaultExport ? requireModule(id).default : requireModule(id);
}

/**
 * Returns the [id, defaultExports] of all modules where filter returns non-undefined.
 * @param filter findAll calls filter once for each enumerable module's exports, adding the exports to the returned array when filter returns a thruthy value.
 */
export function findAllModule<A extends unknown[]>(filter: FilterFn<A>) {
    const { cacheId, finish } = getCacherForUniq(filter.uniq, true);
    const foundExports: {id: number, defaultExport: boolean}[] = [];

    for (const [id, moduleExports] of getModules(filter.uniq, true)) {
        const { exports: testedExports, defaultExport } = filterExports(
            moduleExports,
            id,
            filter,
        );
        if (testedExports !== undefined && typeof defaultExport === "boolean") {
            foundExports.push({ id, defaultExport });
            cacheId(id, testedExports);
        }
    }

    finish(foundExports.length === 0);
    return foundExports;
}

/**
 * Returns the ids of all modules where filter returns non-undefined.
 * @param filter findAll calls filter once for each enumerable module's exports, adding the exports to the returned array when filter returns a thruthy value.
 */
export function findAllModuleId<A extends unknown[]>(filter: FilterFn<A>) {
    return findAllModule(filter).map(e => e.id);
}

/**
 * Returns the ids of all exports where filter returns non-undefined.
 * @param filter findAll calls filter once for each enumerable module's exports, adding the exports to the returned array when filter returns a thruthy value.
 */
export function findAllExports<A extends unknown[]>(filter: FilterFn<A>) {
    return findAllModule(filter).map(ret => {
        if (!ret.id) return;

        const { id, defaultExport } = ret;
        return defaultExport ? requireModule(id).default : requireModule(id);
    });
}
