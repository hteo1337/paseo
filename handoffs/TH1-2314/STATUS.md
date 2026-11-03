# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo; branch: port/TH1-2314-v0150; origin=fork only.
- Worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7. Landed: 0001–0022, 0036/37, 0046–0054, 0057/58; original subjects preserved; integration fixes separate.
- Causation: discarded shared-node_modules experiment. Independent baseline install/build resolves all 10 workspace imports locally; 40e5f1bd4 passes 43, 6a72342a1 fails 1/51. Fresh per-step runtime builds/bisect identify 0048/aefd22985 upsert→claim hunk. Exact paths/outputs in BASELINE.md.
- Fixed workspace drift: explicit create preserved, implicit canonical-cwd reuse/rehome retained; upstream background test unchanged; duplicate createdAt removed; actual bootstrap API adapted; fixture added; synchronous path IO made async; complexity refactored.
- Arity: protocol/client rebuilt first; CLI guard call arities now typecheck against their actual local source, so no upstream signature widening or guard removal was introduced.
- Verification: repaired build:server/typecheck pass; three full workspace files 108 passed (no bail/exclusions). Lint checks production clean; evidence-scanner depth fixed; final commit checks pending in this checkpoint.
- Next: reapply 0064 and keep HEAD drainSessionEvents seam, adding explicit spy-called assertion; complete build/typecheck/lint/full three-file gate before 0025. No other root started.
- Remaining order: 0025→0026–0035/0041 (settleForeground\* for 0029/30), 0055→0056/0063/0071, 0038→0061/62, 0044(+0045), 0059, 0070, both 0073 commits last. Replay omitted clean prerequisites as needed.
- Boundaries: no review/task dispatch, PR, merge, export/updater edits, Electron build/install/restart or upstream push. Report questions in conversation. Phase 1 remains verified at earlier recorded head; current gates in REPLAY.md/BASELINE.md.
