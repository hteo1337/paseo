# TH1-1767 investigation checkpoint

No root cause or production fix is established. No failing regression has been added, no PR opened, and no install, restart, live mirror inspect/reload/archive or model turn performed.

## Source and release reconciliation

The launch checkout was at fork feature commit 550ddec46 and origin pointed at hteo1337/paseo. Before source edits, remotes were corrected to origin=getpaseo/paseo and fork=hteo1337/paseo. dispatch/TH1-1767 now starts at upstream main 59b01b33f. The unrelated canonical checkout branch was left alone.

Upstream main does not contain canUnloadIdleAgent/unloadIdleAgents. Its docs/agent-lifecycle.md explicitly says idle runtimes remain resident indefinitely. Local v0.12 patch 0059 adds the idle unload scheduler and guard; it is incorrect to call these upstream-main functions.

The installed m5 marker is v0.12.0 / seriesHash c184495cf41ea24f / source 35797706cd93e51ce7df301683b59251b86044af, built 2026-10-22T08:57:25Z. That commit was unavailable in this host's repository and on the fork remote; it exists in m5's /Users/hteo/Work/Codex/2026-10-21/task-2/paseo-native. Its compiled manager, import helper, provider registry and Claude provider match the installed unpacked files by SHA256. The local 70-entry series replays with git am -3 on v0.12.0 in /Users/hteo/.paseo/worktrees/TH1-1767-port, branch port/TH1-1767, replay head 181e5b018.

The reconstructed compiled manager and Claude provider are also byte-identical to m5's installed files:

- agent-manager.js: 5be99a9a43110813c9813f35e50cad5d10fbdc86a4f92c40f9b33af414ab186b
- providers/claude/agent.js: 238a50ceda344f14468d98ce6af55c7ff5f130f8ba97361874d34ab407bcdc54

## Reproduction outcome

A fresh synthetic Claude transcript imported into the reconstructed manager produced idle, persistence=true, hasRun=false, no provider subagents, empty activeAgentUses/clientStreamHolds/foregroundMutationTails/autonomousTurnPhases, globalClientStreamHolds=0, and unloaded=1. This did not reproduce the issue.

A second, read-only replay on m5 used the actual untouched stuck session 9d44bb39-5c9c-48b0-b11d-5f64df7965cf from .claude-personal, cwd /Users/hteo/Work/GitHub/hteo1337/claude-code-setup/.claude/worktrees/fleet-rollout-verifiedat-e0d7c0. It ran the existing compiled source above, with a new isolated manager and temporary registry, not the live daemon. Output:

```json
{
  "lifecycle": "idle",
  "persistence": true,
  "hasRun": false,
  "subagents": [],
  "eligible": true,
  "unloaded": 1
}
```

handoffs/replay-import.mjs preserves this diagnostic. Run it against an already built v0.12 plus local series checkout, passing CHECKOUT, CLAUDE_CONFIG_DIR, original CWD and SESSION_ID. It injects availability and a query factory that throws, so it proves the import/history/manager path without starting a provider or consuming auth. It does not reproduce native query startup, plugin hooks, UI subscriptions or existing live leases. The one-millisecond threshold plus future scan time avoids waiting and does not measure the real 15-minute timer.

Read-only m5 filesystem checks found no subagent transcripts for the four untouched stuck sessions listed in the issue. Their stored records have no open-tab labels. This does not rule out selective timeline subscriptions from other surfaces. A permitted paseo agent ls --json --global --all still listed 8c136441, 2534c65a, 153782cc and d7283476 as idle. ps/pgrep confirmed the first session's Claude PID60624 is a child of daemon PID6332. The daemon started 2026-10-22 13:28:21 local, after the installed manager's filesystem creation time (12:38:12). Installed source parity alone still cannot expose live private maps.

## Exact remaining gap

In port source agent-manager.ts:1439 canUnloadIdleAgent checks lifecycle, persistence, foreground/autonomous runs, foreground mutations, running provider subagents, manager/provider pending permissions, live terminals, permission responses, replacement, active uses and stream holds. unloadIdleAgents:1466 also skips owned closes and compares residentLastUsedAt against the threshold. The installed JS guard is at line814. No failing operand has been observed in the live daemon. Existing diagnostics expose aggregate metrics, not these per-agent operands. Do not weaken a guard or claim the query-close warning causes ineligibility without evidence.

Semif ranked capturing live guard/ownership observations above a speculative import fix (live_state=0.9413). This is a diagnostic prioritization only, not the required PR-ready adversarial-review judgment. No PR-ready review has been consumed.

## Verification

- Reconstructed v0.12 source: npm ci --ignore-scripts; npm run build:server: passed.
- Existing suite once: cd packages/server && npx vitest run src/server/agent/agent-manager.test.ts --bail=1: 268/268 passed, 7.24s.
- Patch repo existing validation: node --test validation/mac-signing-gate.test.mjs: 2/2 passed.
- Upstream task checkout: npm ci --ignore-scripts; npm run build:server: passed. npm run lint: 0 errors/0 warnings (4909 files).
- Initial full npm run typecheck failed on eight app dependency-patch errors after ignore-scripts setup. npm run postinstall applied the repository dependency patches; the subsequent full npm run typecheck passed (exit 0). This was setup drift, not a source regression.
- No CI, failing-before/passing-after regression, actual native CLI import run or post-install 15-minute verification is claimed.

- Patch exporter validation: PASEO_REPO=/Users/hteo/.paseo/worktrees/TH1-1767-port ./export-series.sh port/TH1-1767 v0.12.0 --replayed rejected unchanged entry 0002 with "replay changed payload". The beta.3-to-stable three-way replay changes historical context, so this strict mode cannot certify it; no series files were modified. A future fix should be exported independently from its stable source commit, preserving the 70 existing patch files, as entry0070 was.
