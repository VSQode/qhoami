/**
 * qhoami - Session ID extraction for VS Code chat agents
 *
 * Returns the current session ID, workspace hash, and ground-truth reboot count.
 * Also provides a persistent status bar item showing KQ.patch (qhoami#2).
 *
 * History:
 *   0.1.0-0.1.4 — used token.sessionId (VS Code <1.110)
 *   0.1.5       — added token.sessionResource fallback (VS Code 1.110+)
 *   0.2.0       — CLI: ground-truth reboot counting (MD5 hash transitions)
 *   0.3.0       — Extension: adds workspaceHash + rebootCount to output
 *   0.4.0       — Extension: delegates parsing to lib.ts (no code duplication)
 *   0.5.0       — Extension: status bar item showing KQ.patch (qhoami#2)
 */
import * as vscode from 'vscode';
export declare function activate(context: vscode.ExtensionContext): void;
export declare function deactivate(): void;
//# sourceMappingURL=extension.d.ts.map