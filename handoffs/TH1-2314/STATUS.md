# TH1-2314 — Paseo v0.15 port

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo.
- Branch: port/TH1-2314-v0150; worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7; origin=fork only.
- Done: 0001–0019 replayed clean; 0020–0022 re-ported, original subjects preserved. Additional integration commit fixes compile/lint drift from automatic merges.
- Hooks: all three policy names in pluginHookRegistry AND self-mapped legacyRequests, waits:true; upstream session_open alias and waits:false turn.before preserved.
- Verification: npm ci, build:server, real accounts registration and worktree SDK resolution passed; root typecheck passed with npm_config_userconfig=/dev/null (npm12 user allow-scripts incompatibility); lint 0 errors.
- Tests: accounts 578 passed; agent-manager 286; lifecycle handlers 39; archive-if-safe 29; workspace archive 32; deferral 31. Exact commands/output and earlier failures in REPLAY.md.
- Next: after pushing this checkpoint, phase 2 starts at 0057, then 0058/0073, then 0051/0054/0064, then remaining roots in lead order. Stop on dependent conflict; do not improvise.
- Decisions: lead cancelled phase-1 review (none dispatched); no PR, export, updater change, Electron build, install or upstream push; lead owns final review/delivery.
- Open: full-series port remains; no phase-2 behavior verified yet.
