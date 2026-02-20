/**
 * extension.ts — Orchestrator only. Wires up status bars, commands, tool, and probe.
 *
 * History:
 *   0.1.0-0.7.0 — monolithic; all logic lived here
 *   0.8.0       — refactored: scm.ts, ui.ts, probe.ts, tool.ts extracted;
 *                 added SCM state bar (qhoami#7) via vscode.git extension API
 */
import * as vscode from 'vscode';
export declare function activate(context: vscode.ExtensionContext): void;
export declare function deactivate(): void;
//# sourceMappingURL=extension.d.ts.map