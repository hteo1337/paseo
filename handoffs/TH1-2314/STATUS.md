# TH1-2314 — Port local Paseo patches onto v0.15.0 (phase 1)

- Issue: https://linear.app/th1337/issue/TH1-2314 ; project: Paseo Upstream; repo: hteo1337/paseo.
- Branch: port/TH1-2314-v0150; worktree: /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7 (never use shared main checkout).
- Done: verified exact worktree/branch and origin=fork; reset to v0.15.0 (8938fde3c); applied 0001–0004 with git am -3, original subjects retained (last patch af38b5256).
- STOPPED as explicitly required: 0005 git am -3 exited 128: SHA information lacking/useless for packages/app/src/i18n/resources/ar.ts; could not build fake ancestor. Audit clean verdict did not reproduce here.
- Recovery: inspected status and current patch; git am --abort restored the committed 0004 state; no conflict resolution, skipped patch or later replay attempted.
- Verification: exact replay command and terminal output in REPLAY.md; build, registration check, lint and accounts tests NOT RUN; pre-commit automatically ran root typecheck and failed (exit 2, unbuilt declarations; not diagnosed/baselined).
- Next: resolve/reconcile missing 0005 preimage with audit environment, then resume at 0005; 0006–0022 untouched. Preserve both hook maps and distinct session_open/session_opened when reaching 0021/0022.
- Open question: why the audit could resolve the 0005 preimage but this partial clone cannot; no behavioral or compile claims established.
- Delivery: checkpoint pushed only to origin/port/TH1-2314-v0150; handoff checkpoint excludes the failed typecheck hook (documentation only); no PR/review/merge/install (incomplete phase); retain worktree for continuation.
