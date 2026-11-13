// ROUND 10 — on-device diagnostic log (Discord 353 black screen).
//
// Buffers timestamped lines in memory and flushes them (debounced) to
// Documents/pyoncord/kettu-diag.log, readable via WQ Files. The log is
// the only way to measure what actually happens on the phone: the storm
// duration, the warm-up duration, which Metro finds are slow, and whether
// the Plugins page ever mounts. It must never throw: logging must never
// break the code it instruments, so every call is guarded and the file
// write is fire-and-forget.
// ROUND 13 — the log is now PRESERVED across launches. The native
// writeFile truncates, and the old code rewrote the whole in-memory
// array on every flush — so a relaunch destroyed the previous launch's
// log (this is what made the first rc screenshot look empty: it was
// read while the log was still being appended, and any relaunch wipes
// it). On module load we now read the existing file and seed `lines`
// with its tail, and every flush waits for the seed so the first write
// cannot truncate before the seed lands.
import { readFile, writeFile } from "@lib/api/native/fs";
import { debounce } from "es-toolkit";

const DIAG_PATH = "kettu-diag.log";
const MAX_LINES = 500;
const SEED_LINES = 200;

const lines: string[] = [];
let startedAt = 0;

let seedDone: Promise<void> | null = null;
function seedFromDisk(): Promise<void> {
    if (seedDone) return seedDone;
    seedDone = (async () => {
        try {
            const prev = await readFile(DIAG_PATH);
            const prevLines = prev.split("\n").filter(l => l.trim().length > 0);
            const tail = prevLines.slice(-SEED_LINES);
            if (tail.length > 0) {
                lines.unshift(...tail, `--- SESSION ${new Date().toISOString()} (previous launch preserved) ---`);
                if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
            }
        } catch {
            // No previous log (fresh install) — start clean.
        }
    })();
    return seedDone;
}
// Kick off at module load so the seed is usually done before boot logging.
void seedFromDisk();

// ROUND 13 — stable identity for objects (navigation, route.params).
// Lets the log show whether the route params / navigation object are
// recreated on every render (a new identity each time = churn).
const _ids = new WeakMap<object, number>();
let _nextId = 1;
export function idOf(obj: any): number {
    if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return 0;
    let id = _ids.get(obj);
    if (id === undefined) { id = _nextId++; _ids.set(obj, id); }
    return id;
}

const flush = debounce(() => {
    void seedFromDisk().then(() => {
        try {
            void writeFile(DIAG_PATH, lines.join("\n") + "\n");
        } catch {
            // Never break the app for logging.
        }
    });
}, 500);

// ROUND 11 — immediate flush, bypassing the 500 ms debounce. The
// native write is issued synchronously from JS, so it completes even
// if the JS thread blocks or dies right after the call. Use it for
// the tap-path checkpoints (import / navigate / render starts): if
// the thread dies mid-flow, the last flushed line names the step
// where it stopped. Debounced flush alone would lose those lines.
export function diagFlushNow() {
    void seedFromDisk().then(() => {
        try {
            void writeFile(DIAG_PATH, lines.join("\n") + "\n");
        } catch {
            // Never break the app for logging.
        }
    });
}

// ROUND 11 — JS-alive probe. Logs HEARTBEAT every 10 s from boot.
// If the lines keep coming after the user opens Plugins, the JS
// thread is alive and the mount failure is not a JS death; if they
// stop at the tap, the thread died or blocked during the push/render.
let _heartbeatStarted = false;
export function startHeartbeat() {
    if (_heartbeatStarted) return;
    _heartbeatStarted = true;
    setInterval(() => {
        try { diagLog("HEARTBEAT"); } catch { /* ignore */ }
    }, 10000);
}

export function diagLog(line: string) {
    try {
        if (!startedAt) startedAt = Date.now();
        const t = ((Date.now() - startedAt) / 1000).toFixed(2);
        lines.push(`[${t}s] ${line}`);
        if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
        flush();
    } catch {
        // Ignore logging failures entirely.
    }
}
