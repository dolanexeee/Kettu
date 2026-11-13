const {
    after: _after,
    before: _before,
    instead: _instead
} = require("spitroast");

/** @internal */
export const _patcherDelaySymbol = Symbol.for("bunny.api.patcher.delay");

type Unpatcher = () => boolean;
type DelayCallback = (callback: (target: any) => void) => unknown;
type Thenable = { then: typeof Promise.prototype.then };

interface PatchFn<Callback> {
    (func: string, parent: any, callback: Callback, once?: boolean): Unpatcher;
    await(func: string, parent: Promise<unknown>, callback: Callback, once?: boolean): Unpatcher;
}

type BeforeFn = PatchFn<(args: any[]) => unknown | unknown[]>;
type InsteadFn = PatchFn<(args: any[], origFunc: Function) => unknown>;
type AfterFn = PatchFn<(args: any[], ret: any) => unknown>;

/** No-op unpatcher returned when a patch is skipped: nothing was applied, nothing to undo. */
const noopUnpatch: Unpatcher = () => true;

function describeTarget(target: any, method: string): string {
    try {
        return `${String(method)} on ${target?.constructor?.name ?? typeof target}`;
    } catch {
        return String(method);
    }
}

// ROUND 7 (Discord 353): spitroast throws "<method> is not a function in
// <Ctor>" when the target has no such method. On 353 several Discord modules
// were renamed or converted to function components, so a patch that was valid
// on older builds now throws at patch time — or inside the lazy-subscription /
// promise callback, where no try/catch around the registration can catch it —
// and crashes the whole app (round 6: theme patch on Messages, fired the first
// time ChatView rendered). Fail soft instead: warn and skip the patch. A bad
// patch — core or plugin — must never take the app down.
// NOTE: console.warn, not logger — logger (via @metro/wrappers -> lazy)
// touches _patcherDelaySymbol at module-evaluation time (createLazyModule
// uses it as a computed key), so importing it here would put the symbol in
// TDZ and break the bundle at load. console.warn is still routed through
// Kettu's log hook (lib/api/debug.ts).
function safeApply(fn: Function, ctx: any, args: any[]): Unpatcher {
    const [method, target] = args;
    try {
        if (target == null || typeof target[method] !== "function") {
            console.warn(`[Kettu patcher] Skipping patch: ${describeTarget(target, method)} is not a function on this build.`);
            return noopUnpatch;
        }
    } catch (e) {
        console.warn(`[Kettu patcher] Skipping patch: could not read ${String(method)} on target.`, e);
        return noopUnpatch;
    }
    try {
        return fn.apply(ctx, args);
    } catch (e) {
        console.warn(`[Kettu patcher] Skipping patch: patcher threw for ${describeTarget(target, method)}.`, e);
        return noopUnpatch;
    }
}

function create(fn: Function) {
    function patchFn(this: any, ...args: any[]) {
        if (args[1] != null && typeof args[1][_patcherDelaySymbol] === "function") {
            const delayCallback: DelayCallback = args[1][_patcherDelaySymbol];

            let cancel = false;
            let unpatch: Unpatcher = () => cancel = true;

            try {
                delayCallback(target => {
                    if (cancel) return;
                    args[1] = target;
                    unpatch = safeApply(fn, this, args);
                });
            } catch (e) {
                // ROUND 7: a missing/renamed lazy target (e.g. forceLoad throws
                // "X is undefined!") is a skip, not a crash.
                console.warn(`[Kettu patcher] Skipping patch: could not resolve lazy target for ${String(args[0])}.`, e);
                return noopUnpatch;
            }

            return () => unpatch();
        }

        return safeApply(fn, this, args);
    }

    function promisePatchFn(this: any, ...args: [any, Thenable, ...any]) {
        const thenable = args[1];
        if (!thenable || !("then" in thenable)) {
            console.warn("[Kettu patcher] Skipping patch: target is not a then-able object.");
            return noopUnpatch;
        }

        let cancel = false;
        let unpatch: Unpatcher = () => cancel = true;

        try {
            thenable.then(target => {
                if (cancel) return;
                args[1] = target;
                unpatch = patchFn.apply(this, args);
            });
        } catch (e) {
            console.warn("[Kettu patcher] Skipping patch: could not subscribe to patch target.", e);
            return noopUnpatch;
        }

        return () => unpatch();
    }

    return Object.assign(patchFn, { await: promisePatchFn });
}

export const after = create(_after) as AfterFn;
export const before = create(_before) as BeforeFn;
export const instead = create(_instead) as InsteadFn;

/** @internal */
export default { after, before, instead };
