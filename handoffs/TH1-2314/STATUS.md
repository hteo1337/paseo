# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo; branch: port/TH1-2314-v0150; origin=fork only.
- Worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7. Landed: 0001–0022, 0025–0035/0041, 0036/37, 0046–0054, 0057/58, 0064. Original subjects retained; integration fixes separate. Last source 1128b2c86.
- Causation: independent own-install/build/resolution baseline + per-revision builds/bisect identified 0048/aefd22985. Upstream background test unchanged, explicit creation restored and implicit reuse retained; contaminated first experiment discarded. BASELINE.md has full resolve table/outputs.
- Workspace/0064 gate GREEN before keeper: build/typecheck/lint exit0, three full workspace files 108 passed (no bail/exclusions), archive race file 29 passed with explicit drain-spy-called assertion. Checkpoint da6ccbb04 pushed before 0025.
- Keeper: 0025 additive conflicts + providerMessageId adaptation; 0028 preserves upstream restart capture. Other dependent patches applied clean. 0029 existing E2E now proves settleForegroundStart/settleForegroundRun; accepted-event boundary and 0030 late drain retained, no direct pendingRun.start mutation.
- Latest keeper gate GREEN: build:server/typecheck/lint exit0; three keeper/permission/outbox files 34 passed after waiting for fresh client dist. Earlier stale-client test startup failure recorded, not a source regression. Exact commands/output in REPLAY.md/evidence.
- Next: 0055 project groups; preserve upstream #8395 collapsed/open workspace handling, then retry 0056/0063/0071. Stop on a new cascade conflict after root. No later root started.
- Remaining order: 0038→0061/62, 0044(+0045), 0059, 0070, both 0073 commits last; remaining clean patches/prerequisites still to replay. npm_config_userconfig=/dev/null only avoids npm12 nested-install user-config incompatibility.
- Boundaries: no review/task dispatch, PR/merge/export/updater edits, Electron build/install/restart or upstream push. Baseline worktree retired after evidence captured. Report in conversation, no async questions.
