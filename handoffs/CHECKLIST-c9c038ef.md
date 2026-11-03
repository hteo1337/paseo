# TH1-2314 phase 1 checklist

PASEO_AGENT_ID is unset (checked with echo); fallback identifier is this worktree's c9c038ef.

- [x] Verify exact branch/worktree and reset to v0.15.0 (8938fde3c).
- [ ] Replay 0001–0019: 0001–0004 applied; STOP condition at 0005 (exit 128), see TH1-2314/REPLAY.md.
- [ ] Re-port 0020 with original subject.
- [ ] Re-port 0021 and 0022 with both registration maps and original subjects.
- [ ] Build and prove real paseo-accounts lifecycle registration and local module resolution.
- [ ] Run root typecheck, lint, and accounts tests; record exact evidence.
- [ ] Push phase 1 branch and issue handoff; deliver reviewable result without merging.
