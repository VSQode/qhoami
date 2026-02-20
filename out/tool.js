"use strict";
/**
 * tool.ts — QhoamiTool: LanguageModelTool implementation.
 *
 * Returns session identity, reboot count, and SCM state to the calling agent.
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
exports.QhoamiTool = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const lib_1 = require("./lib");
const scm_1 = require("./scm");
class QhoamiTool {
    constructor(workspaceHash, appDataBase, workspaceRoot) {
        this.workspaceHash = workspaceHash;
        this.appDataBase = appDataBase;
        this.workspaceRoot = workspaceRoot;
    }
    async invoke(options, _token) {
        try {
            const session = _extractSessionId(options.toolInvocationToken);
            if (!session.value) {
                return _fail({
                    error: session.error,
                    tokenKeys: session.tokenKeys,
                    tokenRaw: session.tokenRaw,
                    note: 'VS Code API may have changed — check token shape',
                });
            }
            return _ok({
                sessionId: session.value,
                workspaceHash: this.workspaceHash,
                rebootCount: this._rebootCount(session.value),
                scm: (0, scm_1.readScmState)(this.workspaceRoot),
                method: session.method,
                machineId: vscode.env.machineId,
                appName: vscode.env.appName,
                note: 'sessionId is YOUR definitive session ID. rebootCount uses ground-truth MD5 hash transitions. scm reads from vscode.git extension API.',
            });
        }
        catch (e) {
            return _fail({ error: e.message, stack: e.stack });
        }
    }
    _rebootCount(sessionId) {
        if (!this.workspaceHash || !this.appDataBase)
            return null;
        try {
            const filePath = _sessionFilePath(this.appDataBase, this.workspaceHash, sessionId);
            if (!filePath)
                return null;
            const data = (0, lib_1.parseSessionFile)(filePath);
            return data ? (0, lib_1.extractReboots)(data).groundTruth : null;
        }
        catch {
            return null;
        }
    }
}
exports.QhoamiTool = QhoamiTool;
function _extractSessionId(token) {
    const t = token;
    const tokenKeys = t ? Object.keys(t) : [];
    let sessionId = t?.sessionId;
    let method = 'toolInvocationToken.sessionId';
    if (!sessionId) {
        const res = t?.sessionResource;
        if (res) {
            sessionId = typeof res === 'object' && res.path
                ? res.path.replace(/^\/+/, '')
                : typeof res === 'string'
                    ? res.replace(/^[a-z][a-z0-9+\-.]*:\/\/+/i, '')
                    : undefined;
            method = 'toolInvocationToken.sessionResource';
        }
    }
    if (!sessionId) {
        return {
            value: null, method: 'none',
            error: 'toolInvocationToken: neither sessionId nor sessionResource available',
            tokenKeys,
            tokenRaw: t ? JSON.stringify(t) : null,
        };
    }
    return { value: sessionId, method };
}
// ── File resolution ───────────────────────────────────────────────────────────
function _sessionFilePath(appDataBase, workspaceHash, sessionId) {
    const fs = require('fs');
    const dir = path.join(appDataBase, 'workspaceStorage', workspaceHash, 'chatSessions');
    for (const ext of ['.jsonl', '.json']) {
        const p = path.join(dir, `${sessionId}${ext}`);
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
// ── Result builders ───────────────────────────────────────────────────────────
function _ok(data) {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: true, ...data }, null, 2)),
    ]);
}
function _fail(data) {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, ...data }, null, 2)),
    ]);
}
//# sourceMappingURL=tool.js.map