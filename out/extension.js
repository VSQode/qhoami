"use strict";
/**
 * qhoami - Session ID extraction for VS Code chat agents
 *
 * Returns the current session ID, workspace hash, and ground-truth reboot count.
 * Implements VSQode/qhoami#4 (minimal extension output).
 *
 * History:
 *   0.1.0-0.1.4 — used token.sessionId (VS Code <1.110)
 *   0.1.5       — added token.sessionResource fallback (VS Code 1.110+)
 *   0.2.0       — CLI: ground-truth reboot counting (MD5 hash transitions)
 *   0.3.0       — Extension: adds workspaceHash + rebootCount to output
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
// ─── JSONL session parsing (duplicated from cli.ts for extension-host use) ──
const REBOOT_MARKERS = new Set([
    'Summarized conversation history',
    'Compacted conversation',
]);
function _parseSessionFile(filePath) {
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
function _countRebootsGroundTruth(data) {
    const requests = data.requests || [];
    let prevHash = null;
    let count = 0;
    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        if (!req)
            continue;
        for (const resp of (req.response || [])) {
            if (resp.kind === 'progressTaskSerialized' || resp.kind === 'progressTask') {
                const val = (resp.content || {}).value;
                if (REBOOT_MARKERS.has(val)) {
                    const summaryText = req.result?.metadata?.summary?.text ?? null;
                    if (summaryText !== null && summaryText !== undefined) {
                        const hash = crypto.createHash('md5').update(summaryText).digest('hex');
                        if (hash !== prevHash) {
                            count++;
                            prevHash = hash;
                        }
                    }
                    break;
                }
            }
        }
    }
    return count;
}
function _getSessionFilePath(workspaceHash, sessionId) {
    const base = _getAppDataBase();
    if (!base)
        return null;
    const dir = path.join(base, 'workspaceStorage', workspaceHash, 'chatSessions');
    for (const ext of ['.jsonl', '.json']) {
        const p = path.join(dir, `${sessionId}${ext}`);
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function _getAppDataBase() {
    try {
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA;
            if (!appData)
                return null;
            return path.join(appData, 'Code - Insiders', 'User');
        }
        else if (process.platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
        }
        else {
            return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
        }
    }
    catch {
        return null;
    }
}
function _getWorkspaceHash(context) {
    try {
        const storagePath = context.storageUri?.fsPath;
        if (!storagePath)
            return null;
        // storageUri.fsPath = .../workspaceStorage/{hash}/{extensionId}/
        // parent dir = .../workspaceStorage/{hash}
        return path.basename(path.dirname(storagePath));
    }
    catch {
        return null;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
function activate(context) {
    const workspaceHash = _getWorkspaceHash(context);
    const tool = vscode.lm.registerTool('qhoami', new QhoamiTool(workspaceHash));
    context.subscriptions.push(tool);
}
function deactivate() { }
class QhoamiTool {
    constructor(workspaceHash) {
        this.workspaceHash = workspaceHash;
    }
    async invoke(options, _token) {
        try {
            // VS Code <1.110: token.sessionId (plain string UUID)
            // VS Code >=1.110: token.sessionResource (URI object — change in 1.110.0-insider)
            const token = options.toolInvocationToken;
            let sessionId = token?.sessionId;
            let method = 'toolInvocationToken.sessionId';
            if (!sessionId) {
                const res = token?.sessionResource;
                if (res) {
                    if (typeof res === 'object' && res.path) {
                        // URI object: path is "/UUID" — strip leading slash
                        sessionId = res.path.replace(/^\/+/, '');
                    }
                    else if (typeof res === 'string') {
                        // string URI: strip scheme prefix (e.g. "chatSession://UUID")
                        sessionId = res.replace(/^[a-z][a-z0-9+\-.]*:\/\/+/i, '');
                    }
                    method = 'toolInvocationToken.sessionResource';
                }
            }
            const tokenKeys = token ? Object.keys(token) : [];
            if (!sessionId || typeof sessionId !== 'string') {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        success: false,
                        error: 'toolInvocationToken: neither sessionId nor sessionResource available',
                        method: 'none',
                        tokenKeys,
                        tokenRaw: token ? JSON.stringify(token) : null,
                        note: 'VS Code API may have changed again — check token shape'
                    }, null, 2))
                ]);
            }
            // Compute reboot count from session JSONL file
            let rebootCount = null;
            if (this.workspaceHash && sessionId) {
                try {
                    const sessionFilePath = _getSessionFilePath(this.workspaceHash, sessionId);
                    if (sessionFilePath) {
                        const data = _parseSessionFile(sessionFilePath);
                        if (data) {
                            rebootCount = _countRebootsGroundTruth(data);
                        }
                    }
                }
                catch { /* rebootCount stays null — non-fatal */ }
            }
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify({
                    success: true,
                    sessionId,
                    workspaceHash: this.workspaceHash,
                    rebootCount,
                    contextPercent: null, // No public VS Code API exposes context-window usage
                    method,
                    machineId: vscode.env.machineId,
                    appName: vscode.env.appName,
                    note: 'sessionId is YOUR definitive session ID. rebootCount uses ground-truth MD5 hash transitions.'
                }, null, 2))
            ]);
        }
        catch (error) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify({
                    success: false,
                    error: error.message,
                    stack: error.stack
                }, null, 2))
            ]);
        }
    }
}
//# sourceMappingURL=extension.js.map