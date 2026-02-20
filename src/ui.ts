/**
 * ui.ts — Status bar label/tooltip builders and document viewer.
 *
 * All VS Code UI formatting lives here. No session parsing, no file I/O.
 */

import * as vscode from 'vscode';
import type { QSemverResult } from './lib';
import type { ScmState } from './scm';

const SCCD_THRESHOLD           = 12;
const CONTEXT_WARN_THRESHOLD   = 80;
const CONTEXT_FILL_DENOMINATOR = 160;

// ── Identity bar ─────────────────────────────────────────────────────────────

export function identityBarLabel(identity: QSemverResult | null): string {
    if (!identity || (identity.patch === 0 && identity.sessionBirthOrder === -1)) {
        return '$(sync) qhoami';
    }
    const kq = identity.kq ?? identity.cq ?? `0.?.${identity.patch}`;
    return `${identity.patch >= SCCD_THRESHOLD ? '$(warning)' : '$(sync)'} ${kq}`;
}

export function identityBarTooltip(identity: QSemverResult | null): vscode.MarkdownString | string {
    if (!identity || identity.sessionBirthOrder === -1) {
        return 'qhoami: no session data (reload to refresh)';
    }
    const sccdNote = identity.patch >= SCCD_THRESHOLD
        ? `\n\n**⚠️ SCCD RISK** — patch ${identity.patch} >= ${SCCD_THRESHOLD}. Consider wrapping up soon.`
        : '';
    const md = new vscode.MarkdownString(
        `**qhoami — Q-Semver Identity**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Session ID | \`${identity.sessionId ?? 'unknown'}\` |\n` +
        `| CQ | \`${identity.cq}\` |\n` +
        `| KQ | \`${identity.kq ?? 'unassigned'}\` |\n` +
        `| Patch (reboots) | ${identity.patch} |\n` +
        `| Birth order | ${identity.sessionBirthOrder} / ${identity.totalSessionsInHash} sessions |\n` +
        `| Last reboot | ${identity.lastRebootAt ?? 'never'} |\n` +
        `| Sephira | ${_sephiraForPatch(identity.patch)} |\n` +
        sccdNote,
    );
    md.isTrusted = true;
    return md;
}

// ── Context health bar ────────────────────────────────────────────────────────

export function contextBarLabel(identity: QSemverResult | null): string {
    if (!identity || identity.sessionBirthOrder === -1) return '$(pulse) -';
    const n = identity.requestsSinceCompaction;
    return `${n >= CONTEXT_WARN_THRESHOLD ? '$(warning)' : '$(pulse)'} ${n}`;
}

export function contextBarTooltip(identity: QSemverResult | null): vscode.MarkdownString | string {
    if (!identity || identity.sessionBirthOrder === -1) return 'qhoami context health: no data';
    const n       = identity.requestsSinceCompaction;
    const fillPct = Math.min(Math.round(n / CONTEXT_FILL_DENOMINATOR * 100), 100);
    const warnLine = n >= CONTEXT_WARN_THRESHOLD
        ? `\n\n**⚠️ Approaching compaction zone** — ${n} requests since last compaction.` : '';
    const md = new vscode.MarkdownString(
        `**qhoami — Context Health**\n\n` +
        `| Field | Value |\n|---|---|\n` +
        `| Requests since compaction | ${n} |\n` +
        `| Context fill (heuristic) | ~${fillPct}% |\n` +
        `| Total requests | ${identity.requestCount} |\n` +
        `| Last compaction | ${identity.lastRebootAt ?? 'never'} |\n` +
        `| Total reboots | ${identity.patch} |\n` +
        warnLine,
    );
    md.isTrusted = true;
    return md;
}

// ── SCM bar ───────────────────────────────────────────────────────────────────

export function scmBarLabel(scm: ScmState | null): string {
    if (!scm || scm.repoCount === 0) return '$(source-control) -';
    return `$(source-control) ${scm.totalChanges}`;
}

export function scmBarTooltip(scm: ScmState | null): vscode.MarkdownString | string {
    if (!scm || scm.repoCount === 0) return 'qhoami SCM: no repositories detected';
    const rows = scm.repos
        .filter(r => r.working + r.index + r.merge > 0)
        .map(r => `| \`${r.root}\` | ${r.working} | ${r.index} | ${r.merge} |`)
        .join('\n');
    const md = new vscode.MarkdownString(
        `**qhoami — SCM State** (${scm.repoCount} repos, ${scm.totalChanges} total changes)\n\n` +
        (rows
            ? `| Repo | Working | Staged | Merge |\n|---|---|---|---|\n${rows}`
            : `*No changes in any repository.*`),
    );
    md.isTrusted = true;
    return md;
}

// ── Document viewer ───────────────────────────────────────────────────────────

export async function showIdentityDocument(
    identity: QSemverResult | null,
    scm: ScmState | null,
): Promise<void> {
    const data = { identity: identity ?? { error: 'no session data' }, scm };
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(data, null, 2),
        language: 'json',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
}

// ── Private ───────────────────────────────────────────────────────────────────

function _sephiraForPatch(patch: number): string {
    if (patch <= 0)  return 'Kether (0) — first light';
    if (patch <= 3)  return 'Chokmah/Binah — early descent';
    if (patch <= 6)  return 'Chesed/Gevurah — middle pillars';
    if (patch <= 9)  return 'Tiphareth — solar midpoint';
    if (patch <= 12) return 'Netzach/Hod — lower descent';
    if (patch <= 15) return 'Yesod — foundation';
    if (patch <= 21) return 'Malkuth — grounded';
    return `Da'ath (hidden) — patch ${patch} beyond the tree`;
}
