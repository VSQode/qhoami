/**
 * scm.ts — VS Code SCM state via the vscode.git extension API.
 *
 * Uses the SAME source VS Code's own SCM badge reads from.
 * Never uses filesystem scanning or window-focus heuristics.
 */

import * as vscode from 'vscode';

export interface ScmRepoState {
    readonly root: string;      // repo root (relative to workspace root when possible)
    readonly working: number;   // unstaged changes
    readonly index: number;     // staged changes
    readonly merge: number;     // merge conflicts
}

export interface ScmState {
    readonly repoCount: number;
    readonly totalChanges: number;
    readonly repos: ScmRepoState[];
}

// Minimal subset of vscode.git v1 API — avoids importing the full git.d.ts.
// Source: microsoft/vscode extensions/git/src/api/git.d.ts
interface _GitRepository {
    readonly rootUri: vscode.Uri;
    readonly state: {
        readonly workingTreeChanges: readonly unknown[];
        readonly indexChanges: readonly unknown[];
        readonly mergeChanges: readonly unknown[];
    };
}

interface _GitAPI {
    readonly repositories: readonly _GitRepository[];
}

interface _GitExtension {
    getAPI(version: 1): _GitAPI;
}

/**
 * Read current SCM state from the vscode.git extension.
 * @param workspaceRoot Used to relativize repo paths; pass null for absolute paths.
 */
export function readScmState(workspaceRoot: string | null): ScmState {
    try {
        const ext = vscode.extensions.getExtension<_GitExtension>('vscode.git');
        if (!ext?.isActive) return _empty();

        const api = ext.exports.getAPI(1);
        const repos: ScmRepoState[] = api.repositories.map(r => {
            let root = r.rootUri.fsPath;
            if (workspaceRoot && root.startsWith(workspaceRoot)) {
                root = root.slice(workspaceRoot.length).replace(/^[\\/]+/, '') || '.';
            }
            return {
                root,
                working: r.state.workingTreeChanges.length,
                index:   r.state.indexChanges.length,
                merge:   r.state.mergeChanges.length,
            };
        });

        return {
            repoCount:    repos.length,
            totalChanges: repos.reduce((n, r) => n + r.working + r.index + r.merge, 0),
            repos,
        };
    } catch {
        return _empty();
    }
}

function _empty(): ScmState {
    return { repoCount: 0, totalChanges: 0, repos: [] };
}
