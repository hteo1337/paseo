# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo; branch: port/TH1-2314-v0150; origin=fork only.
- Worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7 (never shared main). Last source commit: 2f9d49c94; phase-1 checkpoint: f6862a473.
- Done: 0001–0019 replayed, 0020–0022 re-ported, integration ca366806f fixes compile/lint drift; phase 1 verified and pushed before phase 2.
- Done: 0057 hand-ported into v0.15 create.before (14e8ad497); 0058 cascade applied cleanly (2f9d49c94); original subjects preserved.
- Verification: npm ci/build:server/real accounts registration passed (SDK paths local, three unhooks, unavailable logs=0); accounts 578, manager 286, hooks 39, archives 29/32, deferral 31. Phase 2: provenance unit files 50 passed, daemon E2E 1 passed, post-0058 create file 11 passed; typecheck/lint green.
- Environment: npm_config_userconfig=/dev/null needed for root typecheck (npm12 user allow-scripts incompatibility in nested example install); no verification job skipped. Exact commands/output in REPLAY.md and evidence/.
- STOP: 0073 contains two commits; its second integration needs absent 0059 idle-unload methods and its first tests need absent 0025 KeeperControl. git am --abort restored 0058; neither 0073 message retained, no conflicts/am state left.
- Next: lead sequencing decision: recommend defer whole 0073 until 0025/0059, then resume 0051/0054/0064 → 0025/0026–0035/0041 → 0055/0056/0063/0071 → 0038/0061/0062 → 0044(+0045) → 0059 → 0070. Clean remaining patches still needed; no export/updater work authorized.
- Boundaries: no review/task dispatched, PR, merge, Electron build, install or upstream push. Lead owns final complete-series review. Open: reorder decision; entire phase 2 remains except 0057/0058.
