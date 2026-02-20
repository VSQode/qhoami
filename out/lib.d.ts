/**
 * @vsqode/qhoami — Standalone library
 *
 * Zero VS Code API dependencies. Reads JSONL session files directly.
 * Implements VSQode/qhoami#1: Extract qhoami as standalone Node package.
 *
 * History:
 *   0.4.0 — standalone library extraction with computeQSemver() export
 *            adds kind=2 JSONL support (VGM9/qopilot#9 dual-format fix)
 */
export interface QSemverOptions {
    /** AppData base path (auto-detected if omitted). */
    appdataPath?: string;
    /** Workspace storage hash (auto-discovered from most-recently-active if omitted). */
    workspaceHash?: string;
    /** Specific session ID to look up (auto-detected from most-recently-modified if omitted). */
    sessionId?: string;
}
export interface RebootEvent {
    /** Zero-based index in the requests array */
    index: number;
    /** ISO 8601 timestamp */
    at: string;
    /** MD5 of the compaction summary text — uniqueness key for ground-truth dedup */
    summaryHash: string;
}
export interface QSemverResult {
    sessionId: string | null;
    workspaceHash: string | null;
    /** Chronos-Q semver: "0.{birthOrder}.{patch}" */
    cq: string | null;
    /** Kairos-Q semver: "0.{kqRole}.{patch}" or null if no role detected */
    kq: string | null;
    /** Ground-truth reboot count (MD5 hash-transition dedup applied) */
    patch: number;
    /** Raw reboot marker count (may include phantoms) */
    rawMarkerPatch: number;
    role: string | null;
    customTitle: string | null;
    /** 1-indexed birth order within the workspace hash */
    sessionBirthOrder: number;
    totalSessionsInHash: number;
    requestCount: number;
    firstMessageAt: string | null;
    lastRebootAt: string | null;
    reboots: RebootEvent[];
}
export interface RebootExtractionResult {
    count: number;
    groundTruth: number;
    events: {
        index: number;
        at: string;
    }[];
    eventsGroundTruth: RebootEvent[];
}
export interface SessionSummary {
    id: string;
    firstMessageTime: number;
    requestCount: number;
    modifiedTime: number;
    customTitle: string | null;
    rebootData: RebootExtractionResult;
    filePath: string;
}
/**
 * Auto-detect the VS Code User data directory.
 * Prefers Code - Insiders when both are present (Windows only heuristic).
 */
export declare function getDefaultAppDataPath(flavor?: 'insiders' | 'stable' | 'auto'): string;
/**
 * Parse a VS Code chat session file — supports both:
 *   .json   — legacy monolithic format
 *   .jsonl  — ObjectMutationLog format (snapshot + patches)
 *
 * JSONL opcode meanings:
 *   kind=0  Initial snapshot  (first line only; v = full session object)
 *   kind=1  Set               (walk key path, assign leaf value)
 *   kind=2  Push / batch      (walk key path, append items[] to leaf array)
 *
 * Kind=2 is CRITICAL: new requests arrive as kind=2 pushes onto the requests
 * array. Without kind=2 support the requests[] stays at snapshot state, giving
 * a stale/zero request count and incorrect reboot detection.
 *
 * (Addresses VGM9/qopilot#9 — dual-format JSONL support)
 */
export declare function parseSessionFile(filePath: string): any | null;
/** Extract kairotic Q role string from a session customTitle (e.g. "/AS/0.0.Q/" → "0.0") */
export declare function parseKairosQ(customTitle: string | null): string | null;
/** Map kairotic Q string to human-readable role */
export declare function getRoleName(kq: string | null): string | null;
/**
 * Extract reboot events from a parsed session object.
 *
 * Ground-truth algorithm: a reboot is counted only when the MD5 hash of
 * result.metadata.summary.text transitions to a new value. This filters:
 *   - Phantom reboots (cancelled compaction — no summary text)
 *   - Duplicate events from JSONL kind=2 patch redundancy
 *
 * Both progressTask (pre-June 2025) and progressTaskSerialized (current) are checked.
 */
export declare function extractReboots(data: any): RebootExtractionResult;
/**
 * Read all sessions from a workspace storage hash directory.
 * .jsonl supersedes .json for the same session ID (deduplication).
 * Sessions with zero requests are excluded.
 */
export declare function readSessionsFromHash(appDataPath: string, hash: string): SessionSummary[];
/**
 * Find the current (most recently active) session from a list.
 * Uses file modification time as proxy for last activity.
 */
export declare function findCurrentSession(sessions: SessionSummary[]): SessionSummary | null;
/**
 * Discover the most recently active workspace hash by scanning workspaceStorage.
 * Returns null if no workspace storage directory is found.
 */
export declare function discoverWorkspaceHash(appDataPath: string): string | null;
/**
 * Find a session by ID, optionally limited to a specific workspace hash.
 * Returns null if not found.
 */
export declare function findSessionById(appDataPath: string, sessionId: string, workspaceHash?: string): {
    sessionData: any;
    hash: string;
    filePath: string;
} | null;
/**
 * Compute the full Q-Semver identity for an agent session.
 *
 * All parameters are optional — defaults to auto-discovering the most recently
 * active workspace and session on this machine.
 *
 * @example
 * ```typescript
 * import { computeQSemver } from '@vsqode/qhoami';
 * const id = computeQSemver({ workspaceHash: 'abc123', sessionId: 'uuid-here' });
 * console.log(id.cq); // "0.8.36"
 * ```
 */
export declare function computeQSemver(opts?: QSemverOptions): QSemverResult;
//# sourceMappingURL=lib.d.ts.map