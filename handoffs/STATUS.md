# TH1-630 — workspace uniqueness and fleet repair

Issue: https://linear.app/th1337/issue/TH1-630/eliminate-duplicate-active-paseo-workspaces-and-repair-m5m4-records
Branch/worktree: `fix/th1-630-workspace-uniqueness` at `/Users/hteo/.paseo/worktrees/th1-630/workspace-uniqueness`.

## Done

- Inspected existing claude-code-setup PR #401 and Paseo fork PR #3/`feat/workspace-reuse-1`; this branch does not replace their branch-reuse work.
- Reproduced explicit local `workspace create` twice against one path: zero to two active IDs. Proven archive of one local and one owned-worktree duplicate keeps the shared directory and sibling; repair script also preserved disposable `marker.txt`.
- Implemented atomic canonical-cwd reuse in the registry/provisioning path and filtered missing directories from active workspace listing.
- Added concurrent same-path and distinct-path controls, launch-twice CLI contract e2e, missing-directory e2e, and inverted outdated same-cwd creation tests. The existing archive test now seeds a legacy duplicate to preserve its record-scoped coverage.
- Focused unit suite: 86 passed; launch-twice e2e: 1 passed; missing-directory e2e: 1 passed; archive reuse e2e: 2 passed; legacy duplicate archive e2e: 1 passed; root typecheck and targeted lint pass. The full archive file had one timing-sensitive writer-loop assertion fail under load; its isolated rerun and the unmodified baseline both passed. `session.workspaces.test.ts` has an unrelated pre-existing expectation failure on both baseline and branch.
- m4 repair: 31 active / 26 canonical paths / 5 extras before, 26 active afterward. m5 dry run: 488 active / 294 paths / 194 extras; bounded two-job repair in progress at `~/.paseo/ops-scratch/ws-clean/handoffs/repair-m5-apply-2.log`.
- Sent canonical-path reuse contract to dispatch-v2 lead ba410af7 on m4 and stream 3 agent 0df7676e on m5; both send RPCs confirmed.

## Next

1. Confirm m5 repair completes, inspect every result, rerun fresh inventory and protect the remaining disposable survivor workspaces.
2. Rebase this branch onto an integrated v0.11.2 patch lineage preserving installed series 0041, 0043 and 0047; current base `34df479df` lacks those later patches. Export a new numbered patch from source via `paseo-app-patches`, without dropping existing patches.
3. Finish relevant test gate, review, push PRs, install both hosts, verify running daemon behavior and counts, update Linear, and close the checklist.

See scratch `handoffs/TH1-630-root-cause.md`, repair JSON/logs, and `handoffs/CHECKLIST-unset.md` for exact evidence. No directory was removed by the repair; missing-directory CLI archive failures at 60 seconds were verified as committed archives.
