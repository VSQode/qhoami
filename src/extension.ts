/**
 * qhoami - Session ID extraction for VS Code chat agents
 * 
 * ONE TOOL, ONE JOB: Return the actual session ID from toolInvocationToken.
 * 
 * This is the ONLY way to deterministically get the current chat session ID.
 * All heuristics fail. This doesn't.
 * 
 * History:
 *   0.1.0-0.1.4 — used token.sessionId (VS Code <1.110)
 *   0.1.5       — added token.sessionResource fallback (VS Code 1.110+)
 *                 In 1.110, toolInvocationToken shape changed to {sessionResource: URI}
 */

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const tool = vscode.lm.registerTool('qhoami', new QhoamiTool());
  context.subscriptions.push(tool);
}

export function deactivate() {}

class QhoamiTool implements vscode.LanguageModelTool<{}> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{}>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      // VS Code <1.110: token.sessionId (plain string UUID)
      // VS Code >=1.110: token.sessionResource (URI object — change in 1.110.0-insider)
      const token = options.toolInvocationToken as unknown as {
        sessionId?: string;
        sessionResource?: { scheme?: string; path?: string; toString?: () => string } | string;
      };

      let sessionId = token?.sessionId;
      let method = 'toolInvocationToken.sessionId';

      if (!sessionId) {
        const res = token?.sessionResource;
        if (res) {
          if (typeof res === 'object' && res.path) {
            // URI object: path is "/UUID" — strip leading slash
            sessionId = res.path.replace(/^\/+/, '');
          } else if (typeof res === 'string') {
            // string URI: strip scheme prefix (e.g. "chatSession://UUID")
            sessionId = res.replace(/^[a-z][a-z0-9+\-.]*:\/\/+/i, '');
          }
          method = 'toolInvocationToken.sessionResource';
        }
      }

      const tokenKeys = token ? Object.keys(token) : [];

      if (!sessionId || typeof sessionId !== 'string') {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({
            success: false,
            error: 'toolInvocationToken: neither sessionId nor sessionResource available',
            method: 'none',
            tokenKeys,
            tokenRaw: token ? JSON.stringify(token) : null,
            note: 'VS Code API may have changed again — check token shape'
          }, null, 2))
        ]);
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: true,
          sessionId,
          method,
          machineId: vscode.env.machineId,
          appName: vscode.env.appName,
          note: 'This is YOUR definitive session ID. Use this for all session-based queries.'
        }, null, 2))
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }, null, 2))
      ]);
    }
  }
}
