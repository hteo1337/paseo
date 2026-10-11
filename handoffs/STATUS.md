# TH1-630 — workspace uniqueness and fleet repair

Issue: https://linear.app/th1337/issue/TH1-630/eliminate-duplicate-active-paseo-workspaces-and-repair-m5m4-records
Branch/worktree: `fix/th1-630-workspace-uniqueness` at `/Users/hteo/.paseo/worktrees/th1-630/workspace-uniqueness`. Current implementation head: `78ef2c0bf`, on v0.11.2 source including 0041, 0043, 0047, and the owner Unix port. Fork PR #5 targets `release/v0.11.2-patches` (`96656bc9a`); patch-repo PR #13 carries the exported series.

## Done

- Inspected existing claude-code-setup PR #401 and Paseo fork PR #3/`feat/workspace-reuse-1`; this branch does not replace their branch-reuse work.
- Reproduced explicit local `workspace create` twice against one path: zero to two active IDs. Proven archive of one local and one owned-worktree duplicate keeps the shared directory and sibling; repair script also preserved disposable `marker.txt`.
- Implemented atomic canonical-cwd reuse in the registry/provisioning path and filtered missing directories from active workspace listing.
- Added `workspace archive --if-no-live-agents`: the daemon refuses nonclosed in-memory or stored agents, holds new runs during teardown, and retains the directory. The repair script now requires this option. This closes a race found between the script's inventory check and ordinary archive, which could have archived a newly attached idle/running agent.
- Added concurrent same-path and distinct-path controls, launch-twice CLI contract e2e, missing-directory e2e, and inverted outdated same-cwd creation tests. The existing archive test now seeds a legacy duplicate to preserve its record-scoped coverage.
- Focused unit suite: 86 passed; launch-twice e2e: 1 passed; missing-directory e2e: 1 passed; archive reuse e2e: 2 passed; legacy duplicate archive e2e: 1 passed; root typecheck and targeted lint pass. Exact integrated head: 86 focused tests passed, 7 selected e2e tests passed with 11 skipped across 4 files, clean-install dependency builds and root typecheck passed, server/CLI builds passed. The full archive file had one timing-sensitive writer-loop assertion fail under load; its isolated rerun and the unmodified baseline both passed. `session.workspaces.test.ts` has an unrelated pre-existing expectation failure on both baseline and branch.
- Guarded archive e2e: 9/9 passed, including refusal of a live owner and archival of an empty duplicate while retaining a marker and sibling; archive service unit: 26/26 passed. Targeted lint, pre-commit root typecheck, and final `npm run build:server` passed on the guard commit (`handoffs/build-final-guard.log` records exit 0).
- m4 repair: 31 active / 26 canonical paths / 5 extras before, 26 active afterward. m5 dry run: 488 active / 294 paths / 194 extras; after bounded repair batches, the unguarded script was stopped as soon as the race was identified. Fresh paused inventory: 360 active / 299 real paths / 61 extras (`handoffs/repair-m5-guard-pause.json`); no repair process remains. Resume only after the guarded daemon is installed and a live-owner refusal is verified on that host.
- Sent canonical-path reuse contract to dispatch-v2 lead ba410af7 on m4 and stream 3 agent 0df7676e on m5; both send RPCs confirmed.

## Next

1. Finish read-only review. The patch repo branch `fix/th1-630-workspace-uniqueness` at `/Users/hteo/.paseo/worktrees/th1-630/paseo-app-patches` exports 49 patches, preserving 0047 then 0046 and adding 0052. All patches applied on clean v0.11.2; `git diff --name-status 78ef2c0bf..HEAD` in `~/Paseo/Sandbox/th1-630-patch-verify-guard` differs only in this handoff, so runtime source matches.
2. Push patch PR, complete review/merge, and deploy the guarded build through a same-session-preserving daemon maintenance path. The normal updater stops the daemon and would violate this agent's explicit same-provider-session constraint; do not run that stop/restart from this session or take over Moth.
3. Verify the new RPC guard on disposable live/empty duplicates on m5 and m4. Resume m5 repair, count both hosts after, archive disposable survivors safely, update Linear, and close the checklist.

See scratch `handoffs/TH1-630-root-cause.md`, repair JSON/logs, and `handoffs/CHECKLIST-unset.md` for exact evidence. No directory was removed by the repair; missing-directory CLI archive failures at 60 seconds were verified as committed archives.
