"use strict";
/**
 * extension.ts — Orchestrator only. Wires up status bars, commands, tool, and probe.
 *
 * History:
 *   0.1.0-0.7.0 — monolithic; all logic lived here
 *   0.8.0       — refactored: scm.ts, ui.ts, probe.ts, tool.ts extracted;
 *                 added SCM state bar (qhoami#7) via vscode.git extension API
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
const path = __importStar(require("path"));
const lib_1 = require("./lib");
const scm_1 = require("./scm");
const ui = __importStar(require("./ui"));
const probe_1 = require("./probe");
const tool_1 = require("./tool");
// ── Activate ─────────────────────────────────────────────────────────────────
function activate(context) {
    const workspaceHash = _workspaceHash(context);
    const appDataBase = _appDataBase();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    const identityBar = _makeBar(context, 100, 'qhoami.showIdentity', '$(sync) qhoami');
    const contextBar = _makeBar(context, 99, undefined, '$(pulse) -');
    const scmBar = _makeBar(context, 98, undefined, '$(source-control) -');
    let lastIdentity = null;
    let lastScm = null;
    context.subscriptions.push(vscode.commands.registerCommand('qhoami.showIdentity', () => ui.showIdentityDocument(lastIdentity, lastScm)));
    setTimeout(() => {
        try {
            lastIdentity = (0, lib_1.computeQSemver)({
                appdataPath: appDataBase ?? undefined,
                workspaceHash: workspaceHash ?? undefined,
            });
            lastScm = (0, scm_1.readScmState)(workspaceRoot);
            identityBar.text = ui.identityBarLabel(lastIdentity);
            identityBar.tooltip = ui.identityBarTooltip(lastIdentity);
            contextBar.text = ui.contextBarLabel(lastIdentity);
            contextBar.tooltip = ui.contextBarTooltip(lastIdentity);
            scmBar.text = ui.scmBarLabel(lastScm);
            scmBar.tooltip = ui.scmBarTooltip(lastScm);
            (0, probe_1.writeContextProbe)(workspaceRoot, lastIdentity, lastScm);
        }
        catch (e) {
            identityBar.text = '$(error) qhoami';
            identityBar.tooltip = `qhoami error: ${e.message}`;
        }
    }, 2000);
    context.subscriptions.push(vscode.lm.registerTool('qhoami', new tool_1.QhoamiTool(workspaceHash, appDataBase, workspaceRoot)));
}
function deactivate() { }
// ── Private setup helpers ─────────────────────────────────────────────────────
function _makeBar(context, priority, command, text) {
    const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    bar.command = command;
    bar.text = text;
    bar.show();
    context.subscriptions.push(bar);
    return bar;
}
function _workspaceHash(context) {
    try {
        const storagePath = context.storageUri?.fsPath;
        // storageUri.fsPath = .../workspaceStorage/{hash}/{extensionId}/
        return storagePath ? path.basename(path.dirname(storagePath)) : null;
    }
    catch {
        return null;
    }
}
function _appDataBase() {
    try {
        const os = require('os');
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA;
            return appData ? path.join(appData, 'Code - Insiders', 'User') : null;
        }
        if (process.platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
        }
        return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=extension.js.map