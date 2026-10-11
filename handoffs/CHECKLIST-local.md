# Idle unload delivery checklist (PASEO_AGENT_ID is unset)

- [x] Establish patch baseline and verify clean source tree (v0.10.3 + series through 0044 applied cleanly; starting tree clean).
- [x] Implement configurable idle unload with safe lifecycle and process-tree shutdown (typecheck passed; focused unload test green; provider close paths inspected).
- [x] Add one behavioral test with a failing control and passing treatment (red: missing method; green: 1 passed with threshold and stream controls).
- [x] Run server suite attempt, typecheck, lint, build, and inspect results (unit suite stopped after 18 minutes/9 of 545 files; typecheck and build exit 0; lint four baseline errors).
- [x] Commit and push source branch, export and commit 0045 patch, open both PRs, inspect artifacts (source 364793652; patch 34a62c4; git-am tree equals source tree).
- [x] Record patch 0009 behavior and residual risks in handoff (STATUS.md updated).

## PR #2 review follow-up

- [x] Live ACP terminals keep an otherwise idle agent resident; idle test passed and overlaid old-source control failed at this guard.
- [x] Failed descendant reap cannot leave a dead session callable or publish a resumable record while descendants survive; idle test passed with failed-reap refusal and retry.
- [x] OpenCode shutdown attempts every generation, retains failed ownership, and reports failure; server-manager file passed 20 tests with kill-timeout control.
- [x] Typecheck and final build exited 0; lint returned four baseline errors; focused tests passed; independent review gap was fixed; full series tree matched source; both PR heads and bodies were inspected.
