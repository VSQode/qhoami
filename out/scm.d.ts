/**
 * scm.ts — VS Code SCM state via the vscode.git extension API.
 *
 * Uses the SAME source VS Code's own SCM badge reads from.
 * Never uses filesystem scanning or window-focus heuristics.
 */
export interface ScmRepoState {
    readonly root: string;
    readonly working: number;
    readonly index: number;
    readonly merge: number;
}
export interface ScmState {
    readonly repoCount: number;
    readonly totalChanges: number;
    readonly repos: ScmRepoState[];
}
/**
 * Read current SCM state from the vscode.git extension.
 * @param workspaceRoot Used to relativize repo paths; pass null for absolute paths.
 */
export declare function readScmState(workspaceRoot: string | null): ScmState;
//# sourceMappingURL=scm.d.ts.map