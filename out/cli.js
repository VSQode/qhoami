#!/usr/bin/env node
"use strict";
/**
 * qhoami-cli — CLI companion to qhoami VS Code extension
 *
 * Reads session data from AppData/workspaceStorage without requiring an extension host.
 * Implements VSQode/qhoami#5.
 *
 * Usage:
 *   node out/cli.js --session-id <uuid> [--workspace-hash <hash>]
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
function getAppDataPath() {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA;
        if (!appData)
            throw new Error('APPDATA env var not set');
        return path.join(appData, 'Code - Insiders', 'User');
    }
    else if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
    }
    else {
        return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
    }
}
function parseSessionFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8').trimEnd();
        if (filePath.endsWith('.jsonl')) {
            const lines = raw.split('\n').filter(l => l.trim());
            if (!lines.length)
                return null;
            const first = JSON.parse(lines[0]);
            if (first.kind !== 0)
                return null;
            let data = first.v;
            for (let i = 1; i < lines.length; i++) {
                const patch = JSON.parse(lines[i]);
                if (patch.kind !== 1 || !Array.isArray(patch.k))
                    continue;
                const keys = patch.k;
                let obj = data;
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
        }
        else {
            return JSON.parse(raw);
        }
    }
    catch {
        return null;
    }
}
function parseKairosQ(customTitle) {
    if (!customTitle)
        return null;
    const match = customTitle.match(/\/(?:AS\/)?(\d+\.\d+)\.Q\//i);
    return match ? match[1] : null;
}
function getRoleName(kq) {
    if (!kq)
        return null;
    const n = parseFloat(kq);
    if (n === 0.0)
        return 'husk-overseer';
    if (n >= 0.1 && n < 0.5)
        return 'infrastructure';
    if (n >= 0.5 && n < 1.0)
        return 'quester';
    if (n >= 1.0)
        return 'domain-specialist';
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
function extractReboots(data) {
    const requests = data.requests || [];
    const events = [];
    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        if (!req)
            continue; // sparse array slots from JSONL patch walk
        // Deduplicate: only ONE event per request index, even if response array
        // has multiple copies (JSONL kind=2 replace artifact).
        let found = false;
        for (const resp of (req.response || [])) {
            // Support both old (progressTask) and new (progressTaskSerialized) formats
            if (resp.kind === 'progressTaskSerialized' || resp.kind === 'progressTask') {
                const val = (resp.content || {}).value;
                if (REBOOT_MARKERS.has(val)) {
                    const at = requests[i].timestamp
                        ? new Date(requests[i].timestamp).toISOString()
                        : 'unknown';
                    events.push({ index: i, at });
                    found = true;
                    break; // one reboot per request index — stop scanning this request's parts
                }
            }
            if (found)
                break;
        }
    }
    return { count: events.length, events };
}
function findSession(appDataPath, sessionId, workspaceHash) {
    const storageBase = path.join(appDataPath, 'workspaceStorage');
    if (!fs.existsSync(storageBase))
        return null;
    const hashes = workspaceHash ? [workspaceHash] : fs.readdirSync(storageBase);
    for (const hash of hashes) {
        const sessionsDir = path.join(storageBase, hash, 'chatSessions');
        for (const ext of ['.jsonl', '.json']) {
            const candidate = path.join(sessionsDir, `${sessionId}${ext}`);
            if (fs.existsSync(candidate)) {
                const sessionData = parseSessionFile(candidate);
                if (sessionData)
                    return { sessionData, hash, sessionPath: candidate };
            }
        }
    }
    return null;
}
function getSessionBirthOrder(appDataPath, hash, sessionId) {
    const sessionsDir = path.join(appDataPath, 'workspaceStorage', hash, 'chatSessions');
    if (!fs.existsSync(sessionsDir))
        return { birthOrder: -1, totalSessions: 0 };
    const seen = new Set();
    const sessions = [];
    for (const file of fs.readdirSync(sessionsDir).sort()) {
        if (!file.endsWith('.json') && !file.endsWith('.jsonl'))
            continue;
        const id = file.replace(/\.(json|jsonl)$/, '');
        if (seen.has(id))
            continue;
        seen.add(id);
        const data = parseSessionFile(path.join(sessionsDir, file));
        if (!data)
            continue;
        const requests = data.requests || [];
        if (!requests.length)
            continue;
        const firstReq = requests.find((r) => r != null);
        if (!firstReq)
            continue;
        const firstMessageTime = firstReq.timestamp || data.creationDate || 0;
        sessions.push({ id, firstMessageTime });
    }
    sessions.sort((a, b) => a.firstMessageTime - b.firstMessageTime);
    const idx = sessions.findIndex(s => s.id === sessionId);
    return {
        birthOrder: idx >= 0 ? idx + 1 : -1, // 1-indexed
        totalSessions: sessions.length,
    };
}
function main() {
    const args = process.argv.slice(2);
    let sessionId = null;
    let workspaceHash;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--session-id' && args[i + 1]) {
            sessionId = args[++i];
        }
        else if (args[i] === '--workspace-hash' && args[i + 1]) {
            workspaceHash = args[++i];
        }
        else if (args[i] === '--help' || args[i] === '-h') {
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
    const { count: patch, events: reboots } = extractReboots(sessionData);
    const requests = sessionData.requests || [];
    const firstMessageAt = requests[0]?.timestamp
        ? new Date(requests[0].timestamp).toISOString()
        : sessionData.creationDate
            ? new Date(sessionData.creationDate).toISOString()
            : null;
    const customTitle = sessionData.customTitle || null;
    const kqStr = parseKairosQ(customTitle);
    const role = getRoleName(kqStr);
    const { birthOrder, totalSessions } = getSessionBirthOrder(appDataPath, hash, sessionId);
    const output = {
        sessionId,
        workspaceHash: hash,
        sessionPath,
        cq: `0.${birthOrder}.${patch}`,
        kq: kqStr ? `0.${kqStr}.${patch}` : null,
        patch,
        role,
        customTitle,
        sessionBirthOrder: birthOrder,
        totalSessionsInHash: totalSessions,
        requestCount: requests.length,
        firstMessageAt,
        reboots,
    };
    console.log(JSON.stringify(output, null, 2));
}
main();
//# sourceMappingURL=cli.js.map