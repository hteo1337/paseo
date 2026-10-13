# TH1-661 verification — 2026-10-14

Source implementation: `dddfa37cdcb88964f3b009a25dd2716287572813` (`feat/idle-agent-unload`, PR #2).
Port implementation: `b3de9caf4231ab0dc8c2df6f13e45fe18f3fa98e` (`th1-661-idle-unload-v0.11.2`, based on fork release `8693fba0f53c92d10611ee676ddf8ff6a355cfef`). Remote `origin` here is hteo1337/paseo; the old handoff called this remote `fork`.
Patch source: tag `th1-661-patch-source-v0.11.2`, commit `6d520c5ade61e1b907047810f93bc2edc2bb3ae2`, generated against the checked-in series through 0060. Patch 0061 SHA256: `8a8906dc66a89035597f39d0aad288235c628016cdf882f620eeb3669f5c678b`.

## Behavioral controls

The existing source production files were replaced temporarily with their unchanged HEAD versions, with an explicit byte-difference assertion, then restored in a Python finally block. New regressions failed on that production control: nonresponding ACP close timed out while the responding peer passed; Reload unexpectedly resumed despite a retained failed tree; the sequential idle sweep timed out. Treatment passes all three. ACP starts a real Node ACP subprocess, calls public initialization/close and proves its original PID no longer exists. Manager fakes hold a close promise and injected tree reaper to prove ownership, retry, and independent future sweeps.

## Commands and outcomes

All Vitest commands ran inside `packages/server` with `--bail=1`; no workspace-wide suite ran.

| Checkout | Command selection                                                                                                                                                                 | Outcome                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------- | ----------------------- | --------------------------------------------------------- | ---------------------------------- | --------------------- | -------------------- | ---------------------- |
| Source   | `npx vitest run src/server/agent/provider-registry-wrap.test.ts src/server/agent/agent-manager.test.ts src/server/agent/providers/acp-agent.test.ts --bail=1 -t 'derived sessions | wrapSessionProvider                                              | idle runtime unloads | Reload retries retained | idle sweep deadlines                                      | close reaches process escalation'` | 7 passed, 357 skipped |
| Port     | `provider-registry-wrap.test.ts agent-manager.test.ts -t 'derived sessions                                                                                                        | wrapSessionProvider                                              | idle runtime unloads | Reload retries retained | idle sweep deadlines                                      | reload                             | refresh               | idle agents remain'` | 33 passed, 226 skipped |
| Port     | `providers/acp-agent.test.ts providers/opencode-server-manager.test.ts providers/opencode-agent.recovery.test.ts`                                                                 | 143 passed, 1 skipped                                            |
| Port     | `agent-prompt.test.ts providers/omp/cli-runtime.test.ts providers/pi/cli-runtime.test.ts providers/jsonl-rpc-process.test.ts`                                                     | 76 passed                                                        |
| Port     | `src/server/wire-compat.test.ts`                                                                                                                                                  | 7 passed                                                         |
| Port     | `src/server/session.test.ts -t 'reload                                                                                                                                            | refresh                                                          | subscription         | parent'`                | 27 passed, 144 skipped                                    |
| Port     | `mcp-server.test.ts src/server/wire-compat.test.ts`                                                                                                                               | stopped at MCP workspace-creation assertion: 1 failed, 10 passed |
| Port     | `src/server/session.test.ts src/server/session.workspaces.test.ts -t 'reload                                                                                                      | refresh                                                          | subscription         | parent'`                | stopped at workspace child projectKey assertion: 1 failed |

The two failed assertions reproduce individually on untouched `8693fba0f`; baseline transcripts are retained. They are not repaired or excluded from their suites. The standalone wire and Session file runs above verify the files the earlier bail prevented from running.

`npm run typecheck:server` was run exactly once, on the port, exit 0 (relay, protocol, client, builtin plugins, server, CLI). This preceded the final preservation of the existing series' durable-parent block in Session; the final `npm run build --workspace=@getpaseo/server` passed after that preservation, including server and script compilation. `build:client`, `build:highlight`, `build:plugin`, and relay builds refreshed declarations; initial missing-declaration/SDK resolution attempts failed before tests loaded. Existing dependencies were linked from `~/Paseo/Sandbox/th1-630-verify`; no dependency install was run. Package-local plugin dependencies resolved its SDK 1.4.0 while the server retained SDK 0.17.1.

Scoped `npm run lint -- <changed server files>`: port 0 errors; source 1 existing `buildManagedAgentForRegister` complexity error. Untouched source manager baseline reproduces that error plus its constructor complexity error; moving timeout default resolution out of the constructor removes the latter. `npm run format:files -- <changed files>` and source `git diff --check` passed. Commits use `LEFTHOOK=0` to avoid another typecheck/full lint through hooks and honor the single-run constraint.

## Port and patch proof

All five reviewed semantic conflicts were combined. Additional ACP/bootstrap conflicts preserve the newer ACP deadline and both Unix-listener and idle-timer cleanup. OMP retains `hostTools.close()`. Derived sessions forward process ownership and live-terminal guards.

`npm run generate:config-schema --workspace=@getpaseo/server` regenerated the JSON from source. Regenerating the unmodified base shows that normalized schemas differ only by optional `agents.idleUnloadMinutes` (integer, 0–2147483); the large checked-in JSON diff refreshes stale generator output.

The fork release and checked-in v0.11 series differ in durable-parent/creation-audit recovery. Session's durable-parent block is preserved on the port. The patch was generated on the actual series prefix with `git commit-tree` + `git format-patch --no-signature --zero-commit -1`, and its source object is preserved by the task tag. The normal bulk exporter refuses the fork's squash ancestry (`c57e5e74c is not on ...`); no installer or guard was modified to bypass it. `v0.11/export-refs` pins the separate generated source and payload hash for future exports.

All 57 earlier v0.11 payloads, including scoped-RPC 0047, are byte-identical to patch-repo main. All 58 patches applied from upstream tag v0.11.2 with `git am -3`, exit 0. The 32 payload files match the port branch byte-for-byte. Five untouched client/protocol/creation recovery files remain as published in the series; the port base omits those, and this task does not reconcile that unrelated difference. Root 0045 is also regenerated from the corrected source diff; root workspace 0046–0047 remain separate. The standalone root owner-Unix payload remains intact and outside this feature branch's root series.

No full suite, app build, installer, daemon restart, merge, production change, or CI gate verification was performed. Sol re-review is the next step. Review history and original dispatch record: `TH1-661-REVIEW-HISTORY.md`.
