// ROUND 10 — on-device diagnostic log (Discord 353 black screen).
//
// Buffers timestamped lines in memory and flushes them (debounced) to
// Documents/pyoncord/kettu-diag.log, readable via WQ Files. The log is
// the only way to measure what actually happens on the phone: the storm
// duration, the warm-up duration, which Metro finds are slow, and whether
// the Plugins page ever mounts. It must never throw: logging must never
// break the code it instruments, so every call is guarded and the file
// write is fire-and-forget.
import { writeFile } from "@lib/api/native/fs";
import { debounce } from "es-toolkit";

const DIAG_PATH = "kettu-diag.log";
const MAX_LINES = 500;

const lines: string[] = [];
let startedAt = 0;

const flush = debounce(() => {
    try {
        void writeFile(DIAG_PATH, lines.join("\n") + "\n");
    } catch {
        // Never break the app for logging.
    }
}, 500);

// ROUND 11 — immediate flush, bypassing the 500 ms debounce. The
// native write is issued synchronously from JS, so it completes even
// if the JS thread blocks or dies right after the call. Use it for
// the tap-path checkpoints (import / navigate / render starts): if
// the thread dies mid-flow, the last flushed line names the step
// where it stopped. Debounced flush alone would lose those lines.
export function diagFlushNow() {
    try {
        void writeFile(DIAG_PATH, lines.join("\n") + "\n");
    } catch {
        // Never break the app for logging.
    }
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
