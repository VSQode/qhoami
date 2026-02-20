/**
 * probe.ts — Write context.probe to hermes inbox.
 *
 * Provides hermes with identity and SCM state for context-aware dispatch.
 * Non-fatal on all errors (inbox may not exist, filesystem may be unavailable).
 */

import * as path from 'path';
import type { QSemverResult } from './lib';
import type { ScmState } from './scm';

const CONTEXT_FILL_DENOMINATOR = 160;

/**
 * Write probe file to {workspaceRoot}/_/.vscode/hermes-inbox/context.probe.
 * Only writes if the inbox directory already exists (created by hermes, not us).
 *
 * Format: key: value, one per line, plain text.
 */
export function writeContextProbe(
    workspaceRoot: string | null,
    identity: QSemverResult,
    scm: ScmState | null,
): void {
    if (!workspaceRoot) return;
    const fs = require('fs') as typeof import('fs');
    try {
        const inboxDir = path.join(workspaceRoot, '_', '.vscode', 'hermes-inbox');
        if (!fs.existsSync(inboxDir)) return;

        const fillPct = Math.min(
            Math.round(identity.requestsSinceCompaction / CONTEXT_FILL_DENOMINATOR * 100),
            100,
        );
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
        fs.writeFileSync(
            path.join(inboxDir, 'context.probe'),
            lines.join('\n') + '\n',
            'utf-8',
        );
    } catch { /* non-fatal */ }
}
