/**
 * probe.ts — Write context.probe to hermes inbox.
 *
 * Provides hermes with identity and SCM state for context-aware dispatch.
 * Non-fatal on all errors (inbox may not exist, filesystem may be unavailable).
 */
import type { QSemverResult } from './lib';
import type { ScmState } from './scm';
/**
 * Write probe file to {workspaceRoot}/_/.vscode/hermes-inbox/context.probe.
 * Only writes if the inbox directory already exists (created by hermes, not us).
 *
 * Format: key: value, one per line, plain text.
 */
export declare function writeContextProbe(workspaceRoot: string | null, identity: QSemverResult, scm: ScmState | null): void;
//# sourceMappingURL=probe.d.ts.map