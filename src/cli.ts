#!/usr/bin/env node
/**
 * qhoami-cli — CLI companion to qhoami VS Code extension
 * 
 * Reads session data from AppData/workspaceStorage without requiring an extension host.
 * Implements VSQode/qhoami#5.
 * 
 * Usage:
 *   node out/cli.js --session-id <uuid> [--workspace-hash <hash>]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

function getAppDataPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error('APPDATA env var not set');
    return path.join(appData, 'Code - Insiders', 'User');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
  } else {
    return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
  }
}

function parseSessionFile(filePath: string): any | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trimEnd();
    if (filePath.endsWith('.jsonl')) {
      const lines = raw.split('\n').filter(l => l.trim());
      if (!lines.length) return null;
      const first = JSON.parse(lines[0]);
      if (first.kind !== 0) return null;
      let data = first.v;
      for (let i = 1; i < lines.length; i++) {
        const patch = JSON.parse(lines[i]);
        if (patch.kind !== 1 || !Array.isArray(patch.k)) continue;
        const keys: (string | number)[] = patch.k;
        let obj: any = data;
        for (let j = 0; j < keys.length - 1; j++) {
          const k = keys[j];
          if (obj[k] === undefined || obj[k] === null) {
            obj[k] = typeof keys[j + 1] === 'number' ? [] : {};
          }
          obj = obj[k];
        }
        obj[keys[keys.length - 1]] = patch.v;
      }
      return data;
    } else {
      return JSON.parse(raw);
    }
  } catch { return null; }
}

function parseKairosQ(customTitle: string | null): string | null {
  if (!customTitle) return null;
  const match = customTitle.match(/\/(?:AS\/)?(\d+\.\d+)\.Q\//i);
  return match ? match[1] : null;
}

function getRoleName(kq: string | null): string | null {
  if (!kq) return null;
  const n = parseFloat(kq);
  if (n === 0.0) return 'husk-overseer';
  if (n >= 0.1 && n < 0.5) return 'infrastructure';
  if (n >= 0.5 && n < 1.0) return 'quester';
  if (n >= 1.0) return 'domain-specialist';
  return 'unknown';
}

// Compaction marker strings across VS Code versions:
//   Pre-~Feb 2026: "Summarized conversation history"  (progressTaskSerialized)
//   Post-~Feb 2026: "Compacted conversation"          (progressTaskSerialized)
//   In-progress (NOT a completed reboot): "Compacting conversation..."
const REBOOT_MARKERS = new Set([
  'Summarized conversation history',
  'Compacted conversation',
]);

function extractReboots(data: any): {
  count: number;
  groundTruth: number;
  events: { index: number; at: string }[];
  eventsGroundTruth: { index: number; at: string; summaryHash: string }[];
} {
  const requests: any[] = data.requests || [];
  const events: { index: number; at: string }[] = [];
  const eventsGroundTruth: { index: number; at: string; summaryHash: string }[] = [];
  let prevHash: string | null = null;

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    if (!req) continue;  // sparse array slots from JSONL patch walk
    // Deduplicate: only ONE event per request index, even if response array
    // has multiple copies (JSONL kind=2 replace artifact).
    let found = false;
    for (const resp of (req.response || [])) {
      // Support both old (progressTask) and new (progressTaskSerialized) formats
      if (resp.kind === 'progressTaskSerialized' || resp.kind === 'progressTask') {
        const val = (resp.content || {}).value;
        if (REBOOT_MARKERS.has(val)) {
          const at = req.timestamp ? new Date(req.timestamp).toISOString() : 'unknown';
          events.push({ index: i, at });
          found = true;

          // Ground-truth: count MD5 hash transitions of result.metadata.summary.text
          // Phantom detection: if summary text is absent (cancelled compaction), skip entirely.
          // Two consecutive compactions with identical summary text count as ONE reboot.
          const summaryText: string | null = req.result?.metadata?.summary?.text ?? null;
          if (summaryText !== null && summaryText !== undefined) {
            const hash = crypto.createHash('md5').update(summaryText).digest('hex');
            if (hash !== prevHash) {
              eventsGroundTruth.push({ index: i, at, summaryHash: hash });
              prevHash = hash;
            }
          }
          // else: phantom (no summary text) — skip, do NOT update prevHash

          break;  // one reboot per request index — stop scanning this request's parts
        }
      }
      if (found) break;
    }
  }
  return { count: events.length, groundTruth: eventsGroundTruth.length, events, eventsGroundTruth };
}

function findSession(
  appDataPath: string,
  sessionId: string,
  workspaceHash?: string
): { sessionData: any; hash: string; sessionPath: string } | null {
  const storageBase = path.join(appDataPath, 'workspaceStorage');
  if (!fs.existsSync(storageBase)) return null;

  const hashes = workspaceHash ? [workspaceHash] : fs.readdirSync(storageBase);
  for (const hash of hashes) {
    const sessionsDir = path.join(storageBase, hash, 'chatSessions');
    for (const ext of ['.jsonl', '.json']) {
      const candidate = path.join(sessionsDir, `${sessionId}${ext}`);
      if (fs.existsSync(candidate)) {
        const sessionData = parseSessionFile(candidate);
        if (sessionData) return { sessionData, hash, sessionPath: candidate };
      }
    }
  }
  return null;
}

function getSessionBirthOrder(
  appDataPath: string,
  hash: string,
  sessionId: string
): { birthOrder: number; totalSessions: number } {
  const sessionsDir = path.join(appDataPath, 'workspaceStorage', hash, 'chatSessions');
  if (!fs.existsSync(sessionsDir)) return { birthOrder: -1, totalSessions: 0 };

  const seen = new Set<string>();
  const sessions: { id: string; firstMessageTime: number }[] = [];

  for (const file of fs.readdirSync(sessionsDir).sort()) {
    if (!file.endsWith('.json') && !file.endsWith('.jsonl')) continue;
    const id = file.replace(/\.(json|jsonl)$/, '');
    if (seen.has(id)) continue;
    seen.add(id);

    const data = parseSessionFile(path.join(sessionsDir, file));
    if (!data) continue;
    const requests: any[] = data.requests || [];
    if (!requests.length) continue;
    const firstReq = requests.find((r: any) => r != null);
    if (!firstReq) continue;
    const firstMessageTime = firstReq.timestamp || data.creationDate || 0;
    sessions.push({ id, firstMessageTime });
  }

  sessions.sort((a, b) => a.firstMessageTime - b.firstMessageTime);
  const idx = sessions.findIndex(s => s.id === sessionId);
  return {
    birthOrder: idx >= 0 ? idx + 1 : -1,  // 1-indexed
    totalSessions: sessions.length,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  let sessionId: string | null = null;
  let workspaceHash: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session-id' && args[i + 1]) {
      sessionId = args[++i];
    } else if (args[i] === '--workspace-hash' && args[i + 1]) {
      workspaceHash = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node out/cli.js --session-id <uuid> [--workspace-hash <hash>]');
      process.exit(0);
    }
  }

  if (!sessionId) {
    console.error('Error: --session-id is required');
    console.error('Usage: node out/cli.js --session-id <uuid> [--workspace-hash <hash>]');
    process.exit(1);
  }

  const appDataPath = getAppDataPath();
  const found = findSession(appDataPath, sessionId, workspaceHash);

  if (!found) {
    console.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const { sessionData, hash, sessionPath } = found;
  const {
    count: rawMarkerPatch,
    groundTruth: patch,
    events: rawReboots,
    eventsGroundTruth: reboots,
  } = extractReboots(sessionData);
  const requests: any[] = sessionData.requests || [];

  const firstMessageAt = requests[0]?.timestamp
    ? new Date(requests[0].timestamp).toISOString()
    : sessionData.creationDate
      ? new Date(sessionData.creationDate).toISOString()
      : null;

  const customTitle: string | null = sessionData.customTitle || null;
  const kqStr = parseKairosQ(customTitle);
  const role = getRoleName(kqStr);

  const { birthOrder, totalSessions } = getSessionBirthOrder(appDataPath, hash, sessionId);

  const output = {
    sessionId,
    workspaceHash: hash,
    sessionPath,
    cq: `0.${birthOrder}.${patch}`,
    kq: kqStr ? `0.${kqStr}.${patch}` : null,
    patch,             // ground-truth: MD5 hash-transition count (authoritative)
    rawMarkerPatch,    // raw marker count (for diagnostics; may differ if phantom reboots exist)
    role,
    customTitle,
    sessionBirthOrder: birthOrder,
    totalSessionsInHash: totalSessions,
    requestCount: requests.length,
    firstMessageAt,
    reboots,           // ground-truth events (with summaryHash)
    rawReboots,        // all marker events including phantoms
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
