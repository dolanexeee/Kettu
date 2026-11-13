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
