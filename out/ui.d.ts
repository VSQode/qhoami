/**
 * ui.ts — Status bar label/tooltip builders and document viewer.
 *
 * All VS Code UI formatting lives here. No session parsing, no file I/O.
 */
import * as vscode from 'vscode';
import type { QSemverResult } from './lib';
import type { ScmState } from './scm';
export declare function identityBarLabel(identity: QSemverResult | null): string;
export declare function identityBarTooltip(identity: QSemverResult | null): vscode.MarkdownString | string;
export declare function contextBarLabel(identity: QSemverResult | null): string;
export declare function contextBarTooltip(identity: QSemverResult | null): vscode.MarkdownString | string;
export declare function scmBarLabel(scm: ScmState | null): string;
export declare function scmBarTooltip(scm: ScmState | null): vscode.MarkdownString | string;
export declare function showIdentityDocument(identity: QSemverResult | null, scm: ScmState | null): Promise<void>;
//# sourceMappingURL=ui.d.ts.map