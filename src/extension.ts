/**
 * extension.ts — Orchestrator only. Wires up status bars, commands, tool, and probe.
 *
 * History:
 *   0.1.0-0.7.0 — monolithic; all logic lived here
 *   0.8.0       — refactored: scm.ts, ui.ts, probe.ts, tool.ts extracted;
 *                 added SCM state bar (qhoami#7) via vscode.git extension API
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { computeQSemver, QSemverResult } from './lib';
import { readScmState, ScmState } from './scm';
import * as ui from './ui';
import { writeContextProbe } from './probe';
import { QhoamiTool } from './tool';

// ── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const workspaceHash = _workspaceHash(context);
    const appDataBase   = _appDataBase();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;

    const identityBar = _makeBar(context, 100, 'qhoami.showIdentity', '$(sync) qhoami');
    const contextBar  = _makeBar(context, 99,  undefined,             '$(pulse) -');
    const scmBar      = _makeBar(context, 98,  undefined,             '$(source-control) -');

    let lastIdentity: QSemverResult | null = null;
    let lastScm: ScmState | null = null;

    context.subscriptions.push(
        vscode.commands.registerCommand('qhoami.showIdentity', () =>
            ui.showIdentityDocument(lastIdentity, lastScm)),
    );

    setTimeout(() => {
        try {
            lastIdentity = computeQSemver({
                appdataPath:   appDataBase   ?? undefined,
                workspaceHash: workspaceHash ?? undefined,
            });
            lastScm = readScmState(workspaceRoot);

            identityBar.text    = ui.identityBarLabel(lastIdentity);
            identityBar.tooltip = ui.identityBarTooltip(lastIdentity);
            contextBar.text     = ui.contextBarLabel(lastIdentity);
            contextBar.tooltip  = ui.contextBarTooltip(lastIdentity);
            scmBar.text         = ui.scmBarLabel(lastScm);
            scmBar.tooltip      = ui.scmBarTooltip(lastScm);

            writeContextProbe(workspaceRoot, lastIdentity, lastScm);
        } catch (e: any) {
            identityBar.text    = '$(error) qhoami';
            identityBar.tooltip = `qhoami error: ${e.message}`;
        }
    }, 2000);

    context.subscriptions.push(
        vscode.lm.registerTool('qhoami', new QhoamiTool(workspaceHash, appDataBase, workspaceRoot)),
    );
}

export function deactivate(): void {}

// ── Private setup helpers ─────────────────────────────────────────────────────

function _makeBar(
    context: vscode.ExtensionContext,
    priority: number,
    command: string | undefined,
    text: string,
): vscode.StatusBarItem {
    const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    bar.command = command;
    bar.text    = text;
    bar.show();
    context.subscriptions.push(bar);
    return bar;
}

function _workspaceHash(context: vscode.ExtensionContext): string | null {
    try {
        const storagePath = context.storageUri?.fsPath;
        // storageUri.fsPath = .../workspaceStorage/{hash}/{extensionId}/
        return storagePath ? path.basename(path.dirname(storagePath)) : null;
    } catch { return null; }
}

function _appDataBase(): string | null {
    try {
        const os = require('os') as typeof import('os');
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA;
            return appData ? path.join(appData, 'Code - Insiders', 'User') : null;
        }
        if (process.platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
        }
        return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
    } catch { return null; }
}
