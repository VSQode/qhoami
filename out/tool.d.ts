/**
 * tool.ts — QhoamiTool: LanguageModelTool implementation.
 *
 * Returns session identity, reboot count, and SCM state to the calling agent.
 */
import * as vscode from 'vscode';
export declare class QhoamiTool implements vscode.LanguageModelTool<{}> {
    private readonly workspaceHash;
    private readonly appDataBase;
    private readonly workspaceRoot;
    constructor(workspaceHash: string | null, appDataBase: string | null, workspaceRoot: string | null);
    invoke(options: vscode.LanguageModelToolInvocationOptions<{}>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult>;
    private _rebootCount;
}
//# sourceMappingURL=tool.d.ts.map