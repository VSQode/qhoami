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

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ── Public Types ───────────────────────────────────────────────────────────────

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
  /** Requests processed since the most-recent compaction event (or since session start if no compactions). */
  requestsSinceCompaction: number;
  firstMessageAt: string | null;
  lastRebootAt: string | null;
  reboots: RebootEvent[];
}

export interface RebootExtractionResult {
  count: number;
  groundTruth: number;
  events: { index: number; at: string }[];
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

// ── AppData Discovery ──────────────────────────────────────────────────────────

/**
 * Auto-detect the VS Code User data directory.
 * Prefers Code - Insiders when both are present (Windows only heuristic).
 */
export function getDefaultAppDataPath(flavor: 'insiders' | 'stable' | 'auto' = 'auto'): string {
  const resolveName = (): string => {
    if (flavor === 'insiders') return 'Code - Insiders';
    if (flavor === 'stable') return 'Code';
    // auto: prefer insiders if present on disk
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const insiders = path.join(appData, 'Code - Insiders', 'User');
      return fs.existsSync(insiders) ? 'Code - Insiders' : 'Code';
    }
    return 'Code - Insiders';
  };

  const name = resolveName();
  switch (process.platform) {
    case 'win32': {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, name, 'User');
    }
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', name, 'User');
    default:
      return path.join(os.homedir(), '.config', name, 'User');
  }
}

// ── Session File Parsing ───────────────────────────────────────────────────────

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
export function parseSessionFile(filePath: string): any | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trimEnd();
    if (!filePath.endsWith('.jsonl')) {
      return JSON.parse(raw);
    }

    const lines = raw.split('\n').filter(l => l.trim());
    if (!lines.length) return null;
    const first = JSON.parse(lines[0]);
    if (first.kind !== 0) return null;
    let data = first.v;

    for (let i = 1; i < lines.length; i++) {
      const patch = JSON.parse(lines[i]);
      const patchKind: number = patch.kind;
      if ((patchKind !== 1 && patchKind !== 2) || !Array.isArray(patch.k)) continue;

      const keys: (string | number)[] = patch.k;
      let obj: any = data;
      for (let j = 0; j < keys.length - 1; j++) {
        const k = keys[j];
        if (obj[k] === undefined || obj[k] === null) {
          obj[k] = typeof keys[j + 1] === 'number' ? [] : {};
        }
        obj = obj[k];
      }
      const lastKey = keys[keys.length - 1];

      if (patchKind === 1) {
        obj[lastKey] = patch.v;
      } else if (patchKind === 2 && Array.isArray(patch.v)) {
        if (!Array.isArray(obj[lastKey])) obj[lastKey] = [];
        (obj[lastKey] as any[]).push(...(patch.v as any[]));
      }
    }
    return data;
  } catch {
    return null;
  }
}

// ── Kairos Q Parsing ───────────────────────────────────────────────────────────

/** Extract kairotic Q role string from a session customTitle (e.g. "/AS/0.0.Q/" → "0.0") */
export function parseKairosQ(customTitle: string | null): string | null {
  if (!customTitle) return null;
  const match = customTitle.match(/\/(?:AS\/)?(\d+\.\d+)\.Q\//i);
  return match ? match[1] : null;
}

/** Map kairotic Q string to human-readable role */
export function getRoleName(kq: string | null): string | null {
  if (!kq) return null;
  const n = parseFloat(kq);
  if (n === 0.0) return 'husk-overseer';
  if (n >= 0.1 && n < 0.5) return 'infrastructure';
  if (n >= 0.5 && n < 1.0) return 'quester';
  if (n >= 1.0) return 'domain-specialist';
  return 'unknown';
}

// ── Reboot Counting ────────────────────────────────────────────────────────────

/**
 * Compaction marker strings used across VS Code versions.
 * Note: "Compacting conversation..." (with ellipsis) is IN-PROGRESS — NOT a completed reboot.
 */
const REBOOT_MARKERS = new Set([
  'Summarized conversation history',  // pre-~Feb 2026
  'Compacted conversation',           // post-~Feb 2026
]);

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
export function extractReboots(data: any): RebootExtractionResult {
  const requests: any[] = data.requests || [];
  const events: { index: number; at: string }[] = [];
  const eventsGroundTruth: RebootEvent[] = [];
  let prevHash: string | null = null;

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    if (!req) continue;

    for (const resp of (req.response || [])) {
      if (resp.kind !== 'progressTaskSerialized' && resp.kind !== 'progressTask') continue;
      const val = (resp.content || {}).value;
      if (!REBOOT_MARKERS.has(val)) continue;

      const at = req.timestamp ? new Date(req.timestamp).toISOString() : 'unknown';
      events.push({ index: i, at });

      // Ground-truth dedup: only count hash transitions (skip phantoms with null summary)
      const summaryText: string | null = req.result?.metadata?.summary?.text ?? null;
      if (summaryText !== null && summaryText !== undefined) {
        const hash = crypto.createHash('md5').update(summaryText).digest('hex');
        if (hash !== prevHash) {
          eventsGroundTruth.push({ index: i, at, summaryHash: hash });
          prevHash = hash;
        }
      }
      break; // one reboot event per request regardless of response array length
    }
  }

  return {
    count: events.length,
    groundTruth: eventsGroundTruth.length,
    events,
    eventsGroundTruth,
  };
}

// ── Session Enumeration ────────────────────────────────────────────────────────

/**
 * Read all sessions from a workspace storage hash directory.
 * .jsonl supersedes .json for the same session ID (deduplication).
 * Sessions with zero requests are excluded.
 */
export function readSessionsFromHash(appDataPath: string, hash: string): SessionSummary[] {
  const sessionsDir = path.join(appDataPath, 'workspaceStorage', hash, 'chatSessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const seen = new Set<string>();
  const sessions: Map<string, SessionSummary> = new Map();

  // Sort so .json comes before .jsonl — when both exist, .jsonl replaces .json
  for (const file of fs.readdirSync(sessionsDir).sort()) {
    if (!file.endsWith('.json') && !file.endsWith('.jsonl')) continue;
    const id = file.replace(/\.(json|jsonl)$/, '');

    const filePath = path.join(sessionsDir, file);
    const data = parseSessionFile(filePath);
    if (!data) continue;

    const requests: any[] = data.requests || [];
    if (!requests.length) continue;

    const firstReq = requests.find((r: any) => r != null);
    const firstMessageTime = firstReq?.timestamp || data.creationDate || 0;
    const stats = fs.statSync(filePath);

    const entry: SessionSummary = {
      id,
      firstMessageTime,
      requestCount: requests.filter((r: any) => r != null).length,
      modifiedTime: stats.mtimeMs,
      customTitle: data.customTitle || null,
      rebootData: extractReboots(data),
      filePath,
    };
    sessions.set(id, entry); // .jsonl replaces .json because of sort order
    seen.add(id);
  }

  return Array.from(sessions.values());
}

/**
 * Find the current (most recently active) session from a list.
 * Uses file modification time as proxy for last activity.
 */
export function findCurrentSession(sessions: SessionSummary[]): SessionSummary | null {
  if (!sessions.length) return null;
  return [...sessions].sort((a, b) => b.modifiedTime - a.modifiedTime)[0];
}

/**
 * Discover the most recently active workspace hash by scanning workspaceStorage.
 * Returns null if no workspace storage directory is found.
 */
export function discoverWorkspaceHash(appDataPath: string): string | null {
  const storageBase = path.join(appDataPath, 'workspaceStorage');
  if (!fs.existsSync(storageBase)) return null;

  let bestHash: string | null = null;
  let bestMtime = 0;

  for (const hash of fs.readdirSync(storageBase)) {
    const sessionsDir = path.join(storageBase, hash, 'chatSessions');
    if (!fs.existsSync(sessionsDir)) continue;
    try {
      const mtime = fs.statSync(sessionsDir).mtimeMs;
      if (mtime > bestMtime) { bestMtime = mtime; bestHash = hash; }
    } catch { /* skip unreadable entries */ }
  }

  return bestHash;
}

/**
 * Find a session by ID, optionally limited to a specific workspace hash.
 * Returns null if not found.
 */
export function findSessionById(
  appDataPath: string,
  sessionId: string,
  workspaceHash?: string,
): { sessionData: any; hash: string; filePath: string } | null {
  const storageBase = path.join(appDataPath, 'workspaceStorage');
  if (!fs.existsSync(storageBase)) return null;

  const hashes = workspaceHash ? [workspaceHash] : fs.readdirSync(storageBase);
  for (const hash of hashes) {
    const sessionsDir = path.join(storageBase, hash, 'chatSessions');
    for (const ext of ['.jsonl', '.json']) {
      const filePath = path.join(sessionsDir, `${sessionId}${ext}`);
      if (fs.existsSync(filePath)) {
        const sessionData = parseSessionFile(filePath);
        if (sessionData) return { sessionData, hash, filePath };
      }
    }
  }
  return null;
}

// ── computeQSemver ─────────────────────────────────────────────────────────────

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
export function computeQSemver(opts?: QSemverOptions): QSemverResult {
  const appDataPath = opts?.appdataPath ?? getDefaultAppDataPath();
  const workspaceHash = opts?.workspaceHash ?? discoverWorkspaceHash(appDataPath);

  if (!workspaceHash) {
    return _emptyResult(null, null, opts?.sessionId ?? null);
  }

  const sessions = readSessionsFromHash(appDataPath, workspaceHash);

  let target: SessionSummary | null;
  if (opts?.sessionId) {
    target = sessions.find(s => s.id === opts.sessionId) ?? null;
  } else {
    target = findCurrentSession(sessions);
  }

  if (!target) {
    return _emptyResult(workspaceHash, sessions, opts?.sessionId ?? null);
  }

  // Birth order: 1-indexed position when sessions sorted by firstMessageTime
  const sorted = [...sessions].sort((a, b) => a.firstMessageTime - b.firstMessageTime);
  const birthOrder = sorted.findIndex(s => s.id === target!.id) + 1;

  const { groundTruth: patch, count: rawMarkerPatch, eventsGroundTruth: reboots } = target.rebootData;
  const kqStr = parseKairosQ(target.customTitle);
  const role = getRoleName(kqStr);

  const firstMessageAt = target.firstMessageTime
    ? new Date(target.firstMessageTime).toISOString()
    : null;
  const lastRebootAt = reboots[reboots.length - 1]?.at ?? null;
  const lastRebootIndex = reboots[reboots.length - 1]?.index ?? -1;
  const requestsSinceCompaction = target.requestCount - (lastRebootIndex + 1);

  return {
    sessionId: target.id,
    workspaceHash,
    cq: `0.${birthOrder}.${patch}`,
    kq: kqStr ? `0.${kqStr}.${patch}` : null,
    patch,
    rawMarkerPatch,
    role,
    customTitle: target.customTitle,
    sessionBirthOrder: birthOrder,
    totalSessionsInHash: sessions.length,
    requestCount: target.requestCount,
    requestsSinceCompaction,
    firstMessageAt,
    lastRebootAt,
    reboots,
  };
}

function _emptyResult(
  workspaceHash: string | null,
  sessions: SessionSummary[] | null,
  sessionId: string | null,
): QSemverResult {
  return {
    sessionId,
    workspaceHash,
    cq: null,
    kq: null,
    patch: 0,
    rawMarkerPatch: 0,
    role: null,
    customTitle: null,
    sessionBirthOrder: -1,
    totalSessionsInHash: sessions?.length ?? 0,
    requestCount: 0,
    requestsSinceCompaction: 0,
    firstMessageAt: null,
    lastRebootAt: null,
    reboots: [],
  };
}
