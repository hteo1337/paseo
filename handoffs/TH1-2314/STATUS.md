# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo; branch: port/TH1-2314-v0150; origin=fork only.
- Worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7. Landed: 0001–0022, 0036/37, 0046–0054, 0057/58, 0064; original subjects preserved; integration fixes separate.
- Causation established independently: 40e5f1bd4 passed 43, 6a72342a1 failed background assertion; revision-local install/build/resolution bisect identified 0048/aefd22985 upsert→claim hunk. Initial shared-dependency experiment discarded. Full resolve table/outputs: BASELINE.md.
- Fixed: upstream explicit directory create/background contract restored; implicit atomic canonical-cwd reuse/rehoming retained. Duplicate fields removed, declarations rebuilt, bootstrap API/fixture adapted, IO async and complexity refactored; no lint suppressions added.
- 0064: retained tested drain seam with explicit mock-called assertion; Sandbox-boundary production helper adapted to async IO. Obsolete test edits reconciled to unchanged upstream background/visibility tests; other production hunks kept.
- Gate before keeper GREEN: build:server/typecheck/lint exit 0; three full workspace files 108 passed, no bail/exclusions; archive race file 29 passed. Exact commands/output in REPLAY.md/evidence. npm_config_userconfig=/dev/null avoids npm12 nested-install user-config error only.
- Next: 0025 keeper root, then retry 0026–0035/0041 (0029/30 must use settleForeground\*). Stop and report any new cascade conflict after its root; no later roots started yet.
- Remaining order after keeper: 0055→0056/0063/0071, 0038→0061/62, 0044(+0045), 0059, 0070, both 0073 commits last. Omitted clean prerequisites may replay before roots.
- Boundaries: no review/task dispatch, PR/merge/export/updater edits, Electron build/install/restart or upstream push. Baseline worktree retired after evidence copied. Ask/report in conversation only.
