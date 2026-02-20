#!/usr/bin/env node
"use strict";
/**
 * qhoami-cli — CLI companion to the @vsqode/qhoami library
 *
 * Reads session data from AppData/workspaceStorage without requiring an extension host.
 * Implements VSQode/qhoami#5 (original CLI), refactored to use lib.ts in v0.4.0.
 *
 * Usage:
 *   node out/cli.js --session-id <uuid> [--workspace-hash <hash>]
 */
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("./lib");
function main() {
    const args = process.argv.slice(2);
    let sessionId;
    let workspaceHash;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--session-id' && args[i + 1]) {
            sessionId = args[++i];
        }
        else if (args[i] === '--workspace-hash' && args[i + 1]) {
            workspaceHash = args[++i];
        }
        else if (args[i] === '--help' || args[i] === '-h') {
            console.log('Usage: node out/cli.js --session-id <uuid> [--workspace-hash <hash>]');
            process.exit(0);
        }
    }
    if (!sessionId) {
        console.error('Error: --session-id is required');
        console.error('Usage: node out/cli.js --session-id <uuid> [--workspace-hash <hash>]');
        process.exit(1);
    }
    const appDataPath = (0, lib_1.getDefaultAppDataPath)();
    const result = (0, lib_1.computeQSemver)({ appdataPath: appDataPath, workspaceHash, sessionId });
    if (!result.workspaceHash || result.sessionBirthOrder === -1) {
        console.error(`Session not found: ${sessionId}`);
        process.exit(1);
    }
    const output = {
        sessionId: result.sessionId,
        workspaceHash: result.workspaceHash,
        cq: result.cq,
        kq: result.kq,
        patch: result.patch, // ground-truth: MD5 hash-transition count
        rawMarkerPatch: result.rawMarkerPatch, // diagnostic: raw marker count
        role: result.role,
        customTitle: result.customTitle,
        sessionBirthOrder: result.sessionBirthOrder,
        totalSessionsInHash: result.totalSessionsInHash,
        requestCount: result.requestCount,
        firstMessageAt: result.firstMessageAt,
        reboots: result.reboots, // ground-truth events (with summaryHash)
    };
    console.log(JSON.stringify(output, null, 2));
}
main();
//# sourceMappingURL=cli.js.map