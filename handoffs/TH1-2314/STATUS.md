# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo hteo1337/paseo; branch port/TH1-2314-v0150; origin=fork only.
- Worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7. Landed 0001–0037, 0041, 0046–0058, 0063/64/71; original subjects retained, integration fixes separate.
- Workspace causation: independent own-install/build/resolution baseline + per-revision bisect identified 0048/aefd22985; fixed explicit creation while retaining implicit atomic reuse. Upstream assertion unchanged. BASELINE.md has resolve table/outputs; initial contaminated harness discarded.
- Workspace/0064 pre-keeper gate: build/typecheck/lint exit0; three full workspace files 108 passed, archive race 29 with drain-spy-called assertion. Checkpoint da6ccbb04 pushed first.
- Keeper gate: build/typecheck/lint exit0, 34 tests. Existing 0029 E2E proves settleForegroundStart/settleForegroundRun; accepted-event boundary and 0030 late drain retained without direct pendingRun.start mutation.
- Project groups: 0055 preserves upstream #8395 visibility; 0056 clean; 0063 native API/atomic reuse + regenerated schema; 0023/24 clean prerequisites, 0071 dedupes and preserves event source filter. Latest build/typecheck/lint exit0; session154, metadata39, workspace85, keeper24, sidebar25 passed (REPLAY.md/evidence exact commands).
- Harness: full session fixture blocked on host-signed git tag; process-local signing disabled rerun passed. Cross-package checks run after fresh build; earlier stale declarations recorded. No global config changes.
- Next: 0038 plugin RPC authority, then retry 0061/62; 0044(+0045), 0059, 0070, both 0073 commits last. Replay omitted clean prerequisites; stop on a genuine dependent conflict after root.
- Boundaries: no review/task dispatch, PR/merge/export/updater edits, Electron build/install/restart or upstream push. No open operator questions. npm_config_userconfig=/dev/null only avoids npm12 nested-install incompatibility.
