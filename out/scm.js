"use strict";
/**
 * scm.ts — VS Code SCM state via the vscode.git extension API.
 *
 * Uses the SAME source VS Code's own SCM badge reads from.
 * Never uses filesystem scanning or window-focus heuristics.
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
exports.readScmState = readScmState;
const vscode = __importStar(require("vscode"));
/**
 * Read current SCM state from the vscode.git extension.
 * @param workspaceRoot Used to relativize repo paths; pass null for absolute paths.
 */
function readScmState(workspaceRoot) {
    try {
        const ext = vscode.extensions.getExtension('vscode.git');
        if (!ext?.isActive)
            return _empty();
        const api = ext.exports.getAPI(1);
        const repos = api.repositories.map(r => {
            let root = r.rootUri.fsPath;
            if (workspaceRoot && root.startsWith(workspaceRoot)) {
                root = root.slice(workspaceRoot.length).replace(/^[\\/]+/, '') || '.';
            }
            return {
                root,
                working: r.state.workingTreeChanges.length,
                index: r.state.indexChanges.length,
                merge: r.state.mergeChanges.length,
            };
        });
        return {
            repoCount: repos.length,
            totalChanges: repos.reduce((n, r) => n + r.working + r.index + r.merge, 0),
            repos,
        };
    }
    catch {
        return _empty();
    }
}
function _empty() {
    return { repoCount: 0, totalChanges: 0, repos: [] };
}
//# sourceMappingURL=scm.js.map