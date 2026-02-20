/**
 * tool.ts — QhoamiTool: LanguageModelTool implementation.
 *
 * Returns session identity, reboot count, and SCM state to the calling agent.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseSessionFile, extractReboots } from './lib';
import { readScmState } from './scm';

export class QhoamiTool implements vscode.LanguageModelTool<{}> {
    constructor(
        private readonly workspaceHash: string | null,
        private readonly appDataBase: string | null,
        private readonly workspaceRoot: string | null,
    ) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{}>,
        _token: vscode.CancellationToken,
    ): Promise<vscode.LanguageModelToolResult> {
        try {
            const session = _extractSessionId(options.toolInvocationToken);
            if (!session.value) {
                return _fail({
                    error:     session.error,
                    tokenKeys: session.tokenKeys,
                    tokenRaw:  session.tokenRaw,
                    note: 'VS Code API may have changed — check token shape',
                });
            }

            return _ok({
                sessionId:    session.value,
                workspaceHash: this.workspaceHash,
                rebootCount:  this._rebootCount(session.value),
                scm:          readScmState(this.workspaceRoot),
                method:       session.method,
                machineId:    vscode.env.machineId,
                appName:      vscode.env.appName,
                note: 'sessionId is YOUR definitive session ID. rebootCount uses ground-truth MD5 hash transitions. scm reads from vscode.git extension API.',
            });
        } catch (e: any) {
            return _fail({ error: e.message, stack: e.stack });
        }
    }

    private _rebootCount(sessionId: string): number | null {
        if (!this.workspaceHash || !this.appDataBase) return null;
        try {
            const filePath = _sessionFilePath(this.appDataBase, this.workspaceHash, sessionId);
            if (!filePath) return null;
            const data = parseSessionFile(filePath);
            return data ? extractReboots(data).groundTruth : null;
        } catch { return null; }
    }
}

// ── Session ID extraction ─────────────────────────────────────────────────────

interface _SessionIdResult {
    value: string | null;
    method: string;
    error?: string;
    tokenKeys?: string[];
    tokenRaw?: string | null;
}

function _extractSessionId(token: unknown): _SessionIdResult {
    const t = token as {
        sessionId?: string;
        sessionResource?: { path?: string } | string;
    } | null;
    const tokenKeys = t ? Object.keys(t) : [];

    let sessionId = t?.sessionId;
    let method    = 'toolInvocationToken.sessionId';

    if (!sessionId) {
        const res = t?.sessionResource;
        if (res) {
            sessionId = typeof res === 'object' && res.path
                ? res.path.replace(/^\/+/, '')
                : typeof res === 'string'
                    ? res.replace(/^[a-z][a-z0-9+\-.]*:\/\/+/i, '')
                    : undefined;
            method = 'toolInvocationToken.sessionResource';
        }
    }

    if (!sessionId) {
        return {
            value: null, method: 'none',
            error: 'toolInvocationToken: neither sessionId nor sessionResource available',
            tokenKeys,
            tokenRaw: t ? JSON.stringify(t) : null,
        };
    }
    return { value: sessionId, method };
}

// ── File resolution ───────────────────────────────────────────────────────────

function _sessionFilePath(
    appDataBase: string,
    workspaceHash: string,
    sessionId: string,
): string | null {
    const fs  = require('fs') as typeof import('fs');
    const dir = path.join(appDataBase, 'workspaceStorage', workspaceHash, 'chatSessions');
    for (const ext of ['.jsonl', '.json']) {
        const p = path.join(dir, `${sessionId}${ext}`);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ── Result builders ───────────────────────────────────────────────────────────

function _ok(data: object): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: true, ...data }, null, 2)),
    ]);
}

function _fail(data: object): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, ...data }, null, 2)),
    ]);
}
