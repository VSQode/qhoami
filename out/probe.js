"use strict";
/**
 * probe.ts — Write context.probe to hermes inbox.
 *
 * Provides hermes with identity and SCM state for context-aware dispatch.
 * Non-fatal on all errors (inbox may not exist, filesystem may be unavailable).
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
exports.writeContextProbe = writeContextProbe;
const path = __importStar(require("path"));
const CONTEXT_FILL_DENOMINATOR = 160;
/**
 * Write probe file to {workspaceRoot}/_/.vscode/hermes-inbox/context.probe.
 * Only writes if the inbox directory already exists (created by hermes, not us).
 *
 * Format: key: value, one per line, plain text.
 */
function writeContextProbe(workspaceRoot, identity, scm) {
    if (!workspaceRoot)
        return;
    const fs = require('fs');
    try {
        const inboxDir = path.join(workspaceRoot, '_', '.vscode', 'hermes-inbox');
        if (!fs.existsSync(inboxDir))
            return;
        const fillPct = Math.min(Math.round(identity.requestsSinceCompaction / CONTEXT_FILL_DENOMINATOR * 100), 100);
        const lines = [
            `state: unknown`,
            `context_pct: ${fillPct}`,
            `rsc: ${identity.requestsSinceCompaction}`,
            `patch: ${identity.patch}`,
            `ts: ${new Date().toISOString()}`,
        ];
        if (scm) {
            lines.push(`scm_total_changes: ${scm.totalChanges}`);
            lines.push(`scm_repo_count: ${scm.repoCount}`);
        }
        fs.writeFileSync(path.join(inboxDir, 'context.probe'), lines.join('\n') + '\n', 'utf-8');
    }
    catch { /* non-fatal */ }
}
//# sourceMappingURL=probe.js.map