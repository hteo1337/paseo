# TH1-1013 density restoration

PASEO_AGENT_ID is unset (`echo $PASEO_AGENT_ID` returned empty); using the verified launch run ID prefix 4e5de9de for this checklist.

- [x] Base own dispatch/TH1-1013 branch on requested 9e17e71d9, preserving launch handoff; inspect main and PR callers. Evidence: reset output HEAD 9e17e71d9; origin/main stale, upstream/main matches density contract.
- [x] Install with npm ci and build with npm run build:server before typecheck. Evidence: npm ci exit 0 (2675 packages); npm run build:server exit 0 through CLI.
- [x] Restore Pinned row/text/icon density while preserving nav-group sizing; inspect the minimal diff. Evidence: 2 TSX files, opt-in density style overrides and DensityIcon(xs); Pinned opts in and nav caller unchanged.
- [x] Run npm run typecheck, npm run lint, npm run format, and app unit project; record exact results and baseline blocking failures. Evidence: final typecheck/format exits 0; lint 0 warnings/0 errors; final app unit 627 files/5754 tests passed in 66.99s; render controls differ on compact and match main.
- [x] Commit and push code plus handoff only to dispatch/TH1-1013, verify remote SHA, and update Linear with delivery/next step. Evidence: pushed code + handoff; git ls-remote matches 58cddcecb68ed40a3f319973432b287a77a2da6c; TH1-1013 In Review and delivery comment 82c1b42e-5b4a-45df-bec5-547338a4b535.
