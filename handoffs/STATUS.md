# TH1-1013 — Restore density-aware SidebarSectionHeader sizing

Issue: https://linear.app/th1337/issue/TH1-1013/restore-density-aware-sizing-in-sidebarsectionheader-getpaseopaseo (parent TH1-1012); project Paseo Upstream.
Branch: dispatch/TH1-1013; base 9e17e71d9; code commit 8db2efef64df75cf79a1c596a714b3e2b095c63c.
Done: Pinned opts into density row/text/icon sizing; nav unchanged; code and handoff pushed to own branch; remote SHA verified; TH1-1013 In Review.
Next: lead reviews code commit, re-gates, and integrates into PR #5028. No PR writes authorized.
Verification: npm ci/build:server/typecheck/format exit 0; lint 0 warnings/0 errors; app unit 627 files, 5754 tests passed (66.99s); sizing control matches upstream main. Details: VERIFICATION-4e5de9de.md.
decided: preserve nav sizing via densityAware opt-in; origin/main stale, verified upstream/main instead; own-branch push follows current user instruction over older parent issue note.
Open questions/blockers: none. Browser e2e/CI/native rendering not run; worktree retained for lead integration.
