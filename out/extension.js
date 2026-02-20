"use strict";
/**
 * qhoami - Session ID extraction for VS Code chat agents
 *
 * ONE TOOL, ONE JOB: Return the actual session ID from toolInvocationToken.
 *
 * This is the ONLY way to deterministically get the current chat session ID.
 * All heuristics fail. This doesn't.
 *
 * History:
 *   0.1.0-0.1.4 — used token.sessionId (VS Code <1.110)
 *   0.1.5       — added token.sessionResource fallback (VS Code 1.110+)
 *                 In 1.110, toolInvocationToken shape changed to {sessionResource: URI}
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
function activate(context) {
    const tool = vscode.lm.registerTool('qhoami', new QhoamiTool());
    context.subscriptions.push(tool);
}
function deactivate() { }
class QhoamiTool {
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
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify({
                    success: true,
                    sessionId,
                    method,
                    machineId: vscode.env.machineId,
                    appName: vscode.env.appName,
                    note: 'This is YOUR definitive session ID. Use this for all session-based queries.'
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