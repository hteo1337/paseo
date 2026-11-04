# TH1-2314 phase 1 checklist

PASEO_AGENT_ID is unset (checked with echo); fallback identifier is this worktree's c9c038ef.

- [x] Verify exact branch/worktree and reset to v0.15.0 (8938fde3c).
- [x] Replay 0001–0019 (resumed successfully after lead populated blobs): 0001–0019 applied; initial 0005 blob issue resolved by lead, see TH1-2314/REPLAY.md.
- [x] Re-port 0020 with original subject.
- [x] Re-port 0021 and 0022 with both registration maps and original subjects.
- [x] Build and prove real paseo-accounts lifecycle registration and local module resolution.
- [x] Run root typecheck, lint, and accounts tests; record exact evidence.
- [x] Push phase 1 branch and issue handoff; deliver reviewable result without merging.

Resumed after lead populated all series blobs; preserve 0001–0004, continue at 0005.

- [x] Phase 2: attempt 0057/0058/0073, stopping on a dependent conflict after its root.
- [x] Phase 2: proceed through remaining authorized roots/dependents or document explicit stop condition.

- [x] Resolve 0073 sequencing decision: both messages deferred until the series tail.

Lead approved deferring both 0073 messages until after 0025/0059; resume root order at 0051. Report questions in channel, not async form.

- [x] Port 0051/0054 and retry 0064, replaying needed clean prerequisites without changing root order (0064 still conflicts; mandatory stop documented).
- [x] Preserve mandated 0064 cascade stop with evidence; remaining roots not started.

- [x] Resolve workspace drift and 0064 with the full green pre-keeper gate.

Lead correction: establish causation before retaining background fix.

- [x] Run full provisioning file on detached 40e5f1bd4; if failing also baseline v0.15.0.
- [x] If 40e5f1bd4 passes, confirm 6a72342a1 fails, bisect the file and record exact first bad commit/hunk.
- [x] Reconcile preserved uncommitted changes against independent causal evidence (0048); upstream background test unchanged.
- [x] Reapply 0064, assert drain spy was called, and run full gate before keeper (build/typecheck/lint exit 0; three full workspace files 108/108; archive race file 29/29).

Baseline correction: shared node_modules contaminated @getpaseo resolution. Discard initial baseline/bisect verdicts; harness failure TTLCache was not an assertion failure.

- [x] Give detached baseline its own install/build and record all transitive @getpaseo resolutions before remeasurement.
- [x] Repeat baseline/bisect with revision-local compiled packages at each step.

- [x] Port 0025, retry 0026–0035 and 0041; preserve settleForeground\* for 0029/0030 (34 tests and green build/typecheck/lint checkpoint).

- [x] Port 0055 and retry 0056/0063/0071, preserving upstream collapsed-open-workspace handling (green build/typecheck/lint, session154 and targeted suites).

- [x] Port 0038 and retry 0061/0062; keep upstream snapshot retention (build/typecheck/lint exit0, server249/client213/protocol1).
- [x] Port 0044 and replay 0045 (native/server build,typecheck,lint exit0;187 tests); clean0039/40 and signing-validator1.
- [x] Port 0059 bounded idle provider unload (build/typecheck/lint exit0,569 passed/5 existing skips); clean0060 and Muse65–69/72 verified.
- [x] Port 0070 against rewritten Codex agent (build/typecheck/lint exit0,server720,SDK27,protocol4,Hub18); independent MCP baseline and source-only cold-load fix485 tests.
- [ ] Replay remaining clean prerequisites and all of 0073 last, unsplit into two commits.
- [ ] Run final relevant checks, update exact evidence and issue state, commit and push handoff.
