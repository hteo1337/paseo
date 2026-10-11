# TH1-630 — workspace uniqueness and fleet repair

Issue: https://linear.app/th1337/issue/TH1-630/eliminate-duplicate-active-paseo-workspaces-and-repair-m5m4-records
Branch/worktree: `fix/th1-630-workspace-uniqueness` at `/Users/hteo/.paseo/worktrees/th1-630/workspace-uniqueness`. Integrated linear v0.11.2 source head: `c57e5e74c` after 0041, 0043, and 0047 lineage; fork PR targets `release/v0.11.2-patches` (`96656bc9a`).

## Done

- Inspected existing claude-code-setup PR #401 and Paseo fork PR #3/`feat/workspace-reuse-1`; this branch does not replace their branch-reuse work.
- Reproduced explicit local `workspace create` twice against one path: zero to two active IDs. Proven archive of one local and one owned-worktree duplicate keeps the shared directory and sibling; repair script also preserved disposable `marker.txt`.
- Implemented atomic canonical-cwd reuse in the registry/provisioning path and filtered missing directories from active workspace listing.
- Added concurrent same-path and distinct-path controls, launch-twice CLI contract e2e, missing-directory e2e, and inverted outdated same-cwd creation tests. The existing archive test now seeds a legacy duplicate to preserve its record-scoped coverage.
- Focused unit suite: 86 passed; launch-twice e2e: 1 passed; missing-directory e2e: 1 passed; archive reuse e2e: 2 passed; legacy duplicate archive e2e: 1 passed; root typecheck and targeted lint pass. Exact integrated head: 86 focused tests passed, 7 selected e2e tests passed with 11 skipped across 4 files, clean-install dependency builds and root typecheck passed, server/CLI builds passed. The full archive file had one timing-sensitive writer-loop assertion fail under load; its isolated rerun and the unmodified baseline both passed. `session.workspaces.test.ts` has an unrelated pre-existing expectation failure on both baseline and branch.
- m4 repair: 31 active / 26 canonical paths / 5 extras before, 26 active afterward. m5 dry run: 488 active / 294 paths / 194 extras; after the first bounded batch, fresh plan had 432 active / 296 paths / 136 extras. The restarted two-job repair is in progress at `~/.paseo/ops-scratch/ws-clean/handoffs/repair-m5-apply-3.log`; the tool retries concurrent CLI/store snapshot races and verifies each archive result, keeper, and shared directory.
- Sent canonical-path reuse contract to dispatch-v2 lead ba410af7 on m4 and stream 3 agent 0df7676e on m5; both send RPCs confirmed.

## Next

1. Confirm m5 repair completes, inspect every result, rerun fresh inventory and protect the remaining disposable survivor workspaces.
2. Patch repo branch `fix/th1-630-workspace-uniqueness` in `/Users/hteo/.paseo/worktrees/th1-630/paseo-app-patches` exports 47 patches from this source head, preserving 0047 and adding 0048–0051. `git apply` of the series to v0.11.2 matched all 184 changed source paths; commit/push the patch repo after review.
3. Finish relevant test gate, review, push PRs, install both hosts, verify running daemon behavior and counts, update Linear, and close the checklist.

See scratch `handoffs/TH1-630-root-cause.md`, repair JSON/logs, and `handoffs/CHECKLIST-unset.md` for exact evidence. No directory was removed by the repair; missing-directory CLI archive failures at 60 seconds were verified as committed archives.
