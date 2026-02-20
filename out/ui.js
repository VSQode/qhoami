"use strict";
/**
 * ui.ts — Status bar label/tooltip builders and document viewer.
 *
 * All VS Code UI formatting lives here. No session parsing, no file I/O.
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
exports.identityBarLabel = identityBarLabel;
exports.identityBarTooltip = identityBarTooltip;
exports.contextBarLabel = contextBarLabel;
exports.contextBarTooltip = contextBarTooltip;
exports.scmBarLabel = scmBarLabel;
exports.scmBarTooltip = scmBarTooltip;
exports.showIdentityDocument = showIdentityDocument;
const vscode = __importStar(require("vscode"));
const SCCD_THRESHOLD = 12;
const CONTEXT_WARN_THRESHOLD = 80;
const CONTEXT_FILL_DENOMINATOR = 160;
// ── Identity bar ─────────────────────────────────────────────────────────────
function identityBarLabel(identity) {
    if (!identity || (identity.patch === 0 && identity.sessionBirthOrder === -1)) {
        return '$(sync) qhoami';
    }
    const kq = identity.kq ?? identity.cq ?? `0.?.${identity.patch}`;
    return `${identity.patch >= SCCD_THRESHOLD ? '$(warning)' : '$(sync)'} ${kq}`;
}
function identityBarTooltip(identity) {
    if (!identity || identity.sessionBirthOrder === -1) {
        return 'qhoami: no session data (reload to refresh)';
    }
    const sccdNote = identity.patch >= SCCD_THRESHOLD
        ? `\n\n**⚠️ SCCD RISK** — patch ${identity.patch} >= ${SCCD_THRESHOLD}. Consider wrapping up soon.`
        : '';
    const md = new vscode.MarkdownString(`**qhoami — Q-Semver Identity**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Session ID | \`${identity.sessionId ?? 'unknown'}\` |\n` +
        `| CQ | \`${identity.cq}\` |\n` +
        `| KQ | \`${identity.kq ?? 'unassigned'}\` |\n` +
        `| Patch (reboots) | ${identity.patch} |\n` +
        `| Birth order | ${identity.sessionBirthOrder} / ${identity.totalSessionsInHash} sessions |\n` +
        `| Last reboot | ${identity.lastRebootAt ?? 'never'} |\n` +
        `| Sephira | ${_sephiraForPatch(identity.patch)} |\n` +
        sccdNote);
    md.isTrusted = true;
    return md;
}
// ── Context health bar ────────────────────────────────────────────────────────
function contextBarLabel(identity) {
    if (!identity || identity.sessionBirthOrder === -1)
        return '$(pulse) -';
    const n = identity.requestsSinceCompaction;
    return `${n >= CONTEXT_WARN_THRESHOLD ? '$(warning)' : '$(pulse)'} ${n}`;
}
function contextBarTooltip(identity) {
    if (!identity || identity.sessionBirthOrder === -1)
        return 'qhoami context health: no data';
    const n = identity.requestsSinceCompaction;
    const fillPct = Math.min(Math.round(n / CONTEXT_FILL_DENOMINATOR * 100), 100);
    const warnLine = n >= CONTEXT_WARN_THRESHOLD
        ? `\n\n**⚠️ Approaching compaction zone** — ${n} requests since last compaction.` : '';
    const md = new vscode.MarkdownString(`**qhoami — Context Health**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Requests since compaction | ${n} |\n` +
        `| Context fill (heuristic) | ~${fillPct}% |\n` +
        `| Total requests | ${identity.requestCount} |\n` +
        `| Last compaction | ${identity.lastRebootAt ?? 'never'} |\n` +
        `| Total reboots | ${identity.patch} |\n` +
        warnLine);
    md.isTrusted = true;
    return md;
}
// ── SCM bar ───────────────────────────────────────────────────────────────────
function scmBarLabel(scm) {
    if (!scm || scm.repoCount === 0)
        return '$(source-control) -';
    return `$(source-control) ${scm.totalChanges}`;
}
function scmBarTooltip(scm) {
    if (!scm || scm.repoCount === 0)
        return 'qhoami SCM: no repositories detected';
    const rows = scm.repos
        .filter(r => r.working + r.index + r.merge > 0)
        .map(r => `| \`${r.root}\` | ${r.working} | ${r.index} | ${r.merge} |`)
        .join('\n');
    const md = new vscode.MarkdownString(`**qhoami — SCM State** (${scm.repoCount} repos, ${scm.totalChanges} total changes)\n\n` +
        (rows
            ? `| Repo | Working | Staged | Merge |\n|---|---|---|---|\n${rows}`
            : `*No changes in any repository.*`));
    md.isTrusted = true;
    return md;
}
// ── Document viewer ───────────────────────────────────────────────────────────
async function showIdentityDocument(identity, scm) {
    const data = { identity: identity ?? { error: 'no session data' }, scm };
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(data, null, 2),
        language: 'json',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}
// ── Private ───────────────────────────────────────────────────────────────────
function _sephiraForPatch(patch) {
    if (patch <= 0)
        return 'Kether (0) — first light';
    if (patch <= 3)
        return 'Chokmah/Binah — early descent';
    if (patch <= 6)
        return 'Chesed/Gevurah — middle pillars';
    if (patch <= 9)
        return 'Tiphareth — solar midpoint';
    if (patch <= 12)
        return 'Netzach/Hod — lower descent';
    if (patch <= 15)
        return 'Yesod — foundation';
    if (patch <= 21)
        return 'Malkuth — grounded';
    return `Da'ath (hidden) — patch ${patch} beyond the tree`;
}
//# sourceMappingURL=ui.js.map