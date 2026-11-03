# TH1-2314 phase 1 checklist

PASEO_AGENT_ID is unset (checked with echo); fallback identifier is this worktree's c9c038ef.

- [x] Verify exact branch/worktree and reset to v0.15.0 (8938fde3c).
- [x] Replay 0001–0019 (resumed successfully after lead populated blobs): 0001–0019 applied; initial 0005 blob issue resolved by lead, see TH1-2314/REPLAY.md.
- [x] Re-port 0020 with original subject.
- [x] Re-port 0021 and 0022 with both registration maps and original subjects.
- [x] Build and prove real paseo-accounts lifecycle registration and local module resolution.
- [x] Run root typecheck, lint, and accounts tests; record exact evidence.
- [ ] Push phase 1 branch and issue handoff; deliver reviewable result without merging.

Resumed after lead populated all series blobs; preserve 0001–0004, continue at 0005.

- [ ] Phase 2: attempt 0057/0058/0073, stopping on a dependent conflict after its root.
- [ ] Phase 2: proceed through remaining authorized roots/dependents or document explicit stop condition.
