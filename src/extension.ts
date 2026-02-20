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
import * as path from 'path';
import { parseSessionFile, extractReboots, computeQSemver, QSemverResult } from './lib';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getSessionFilePath(
  appDataBase: string,
  workspaceHash: string,
  sessionId: string,
): string | null {
  const fs = require('fs') as typeof import('fs');
  const dir = path.join(appDataBase, 'workspaceStorage', workspaceHash, 'chatSessions');
  for (const ext of ['.jsonl', '.json']) {
    const p = path.join(dir, `${sessionId}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function _getAppDataBase(): string | null {
  try {
    const os = require('os') as typeof import('os');
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA;
      if (!appData) return null;
      return path.join(appData, 'Code - Insiders', 'User');
    } else if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User');
    } else {
      return path.join(os.homedir(), '.config', 'Code - Insiders', 'User');
    }
  } catch { return null; }
}

function _getWorkspaceHash(context: vscode.ExtensionContext): string | null {
  try {
    const storagePath = context.storageUri?.fsPath;
    if (!storagePath) return null;
    // storageUri.fsPath = .../workspaceStorage/{hash}/{extensionId}/
    // parent dir = .../workspaceStorage/{hash}
    return path.basename(path.dirname(storagePath));
  } catch { return null; }
}

// ── Status Bar (qhoami#2) ─────────────────────────────────────────────────────

const SCCD_THRESHOLD = 12;

/**
 * Build the display label: "⟲ 0.0.10" or "⚠️ 0.0.12" when approaching SCCD
 */
function _statusBarLabel(identity: QSemverResult | null): string {
  if (!identity || identity.patch === 0 && identity.sessionBirthOrder === -1) {
    return '$(sync) qhoami';
  }
  const kq = identity.kq ?? identity.cq ?? `0.?.${identity.patch}`;
  const prefix = identity.patch >= SCCD_THRESHOLD ? '$(warning)' : '$(sync)';
  return `${prefix} ${kq}`;
}

/**
 * Build the tooltip shown on hover.
 */
function _statusBarTooltip(identity: QSemverResult | null): vscode.MarkdownString | string {
  if (!identity || identity.sessionBirthOrder === -1) {
    return 'qhoami: no session data (reload to refresh)';
  }
  const sccdNote = identity.patch >= SCCD_THRESHOLD
    ? `\n\n**⚠️ SCCD RISK** — patch ${identity.patch} >= ${SCCD_THRESHOLD}. Consider wrapping up soon.`
    : '';

  const sephira = _sephiraForPatch(identity.patch);
  const md = new vscode.MarkdownString(
    `**qhoami — Q-Semver Identity**\n\n` +
    `| Field | Value |\n` +
    `|---|---|\n` +
    `| Session ID | \`${identity.sessionId ?? 'unknown'}\` |\n` +
    `| CQ | \`${identity.cq}\` |\n` +
    `| KQ | \`${identity.kq ?? 'unassigned'}\` |\n` +
    `| Patch (reboots) | ${identity.patch} |\n` +
    `| Birth order | ${identity.sessionBirthOrder} / ${identity.totalSessionsInHash} sessions |\n` +
    `| Last reboot | ${identity.lastRebootAt ?? 'never'} |\n` +
    `| Sephira | ${sephira} |\n` +
    sccdNote,
  );
  md.isTrusted = true;
  return md;
}

/**
 * Sefirotic position by patch number (Lightning Flash descent + Serpent ascent).
 * Purely cosmetic — a meditation on where in the cycle we are.
 */
function _sephiraForPatch(patch: number): string {
  if (patch <= 0) return 'Kether (0) — first light';
  if (patch <= 3) return 'Chokmah/Binah — early descent';
  if (patch <= 6) return 'Chesed/Gevurah — middle pillars';
  if (patch <= 9) return 'Tiphareth — solar midpoint';
  if (patch <= 12) return 'Netzach/Hod — lower descent';
  if (patch <= 15) return 'Yesod — foundation';
  if (patch <= 21) return 'Malkuth — grounded';
  return `Da\'ath (hidden) — patch ${patch} beyond the tree`;
}

/**
 * Show identity JSON in a new editor tab (click handler for status bar item).
 */
async function _showIdentityDocument(identity: QSemverResult | null): Promise<void> {
  const content = JSON.stringify(identity ?? { error: 'no session data' }, null, 2);
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'json',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

// ── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const workspaceHash = _getWorkspaceHash(context);
  const appDataBase = _getAppDataBase();

  // ─ Status bar item (qhoami#2) ─
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'qhoami.showIdentity';
  statusBarItem.text = '$(sync) qhoami';
  statusBarItem.tooltip = 'qhoami: reading identity...';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─ Show identity command (click target) ─
  let lastIdentity: QSemverResult | null = null;
  const showCmd = vscode.commands.registerCommand('qhoami.showIdentity', async () => {
    await _showIdentityDocument(lastIdentity);
  });
  context.subscriptions.push(showCmd);

  // ─ Read identity once at startup (async, non-blocking) ─
  setTimeout(() => {
    try {
      const identity = computeQSemver({
        appdataPath: appDataBase ?? undefined,
        workspaceHash: workspaceHash ?? undefined,
      });
      lastIdentity = identity;
      statusBarItem.text = _statusBarLabel(identity);
      statusBarItem.tooltip = _statusBarTooltip(identity);
    } catch (e: any) {
      statusBarItem.text = '$(error) qhoami';
      statusBarItem.tooltip = `qhoami error: ${e.message}`;
    }
  }, 2000); // 2s delay to let workspace hash resolve

  // ─ Tool registration ─
  const tool = vscode.lm.registerTool('qhoami', new QhoamiTool(workspaceHash, appDataBase));
  context.subscriptions.push(tool);
}

export function deactivate() {}

// ── QhoamiTool ────────────────────────────────────────────────────────────────

class QhoamiTool implements vscode.LanguageModelTool<{}> {
  constructor(
    private readonly workspaceHash: string | null,
    private readonly appDataBase: string | null,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{}>,
    _token: vscode.CancellationToken,
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
            note: 'VS Code API may have changed again — check token shape',
          }, null, 2)),
        ]);
      }

      // Compute reboot count from session JSONL file
      let rebootCount: number | null = null;
      if (this.workspaceHash && this.appDataBase && sessionId) {
        try {
          const sessionFilePath = _getSessionFilePath(this.appDataBase, this.workspaceHash, sessionId);
          if (sessionFilePath) {
            const data = parseSessionFile(sessionFilePath);
            if (data) {
              rebootCount = extractReboots(data).groundTruth;
            }
          }
        } catch { /* rebootCount stays null — non-fatal */ }
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: true,
          sessionId,
          workspaceHash: this.workspaceHash,
          rebootCount,
          contextPercent: null,  // No public VS Code API exposes context-window usage
          method,
          machineId: vscode.env.machineId,
          appName: vscode.env.appName,
          note: 'sessionId is YOUR definitive session ID. rebootCount uses ground-truth MD5 hash transitions.',
        }, null, 2)),
      ]);
    } catch (error: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack,
        }, null, 2)),
      ]);
    }
  }
}
