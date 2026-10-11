# TH1-630 — workspace uniqueness and fleet repair

Issue: https://linear.app/th1337/issue/TH1-630/eliminate-duplicate-active-paseo-workspaces-and-repair-m5m4-records
Branch: `fix/th1-630-workspace-uniqueness`; source PR: https://github.com/hteo1337/paseo/pull/5; patch PR: https://github.com/hteo1337/paseo-app-patches/pull/13. The release source base is `fork/release/v0.11.2-patches`; `fork/main` is an incompatible 0.9.0-beta.1 tree.

## Implemented

- Daemon registry atomically reuses one active workspace per canonical cwd. Missing directories do not appear as active. CLI launch-twice, explicit create, worktree and concurrent create paths are covered by tests.
- Workspace archival has `--if-no-live-agents`, refuses live in-memory or stored agents, holds new runs, and preserves the directory. Dry-run repair keeps a live-agent owner or newest record, rechecks before each archive, and fails closed on agent archive errors.
- Git common dir and remote identity attach linked worktrees and review clones to their owning project. Explicit nested project registration and legacy non-git nested projects retain their distinct root; `/var` and `/private/var` aliases are canonicalized. Guarded `project delete --if-empty` checks archived references and serializes deletion against new workspace claims.
- A failed provider import retains a workspace once it is published. Another import or create-agent launch can already have reused it, so rollback cannot safely remove it. The registry's atomic cwd claim still prevents a second active record.
- Scripts under `scripts/` support dry-run duplicate repair, project rehome, and throwaway retirement. No repair apply may run until the guarded daemon is installed and live-owner refusal is proven on that host.

## Verification and review

- Original m5 repro: two `workspace create --isolation local` calls for the same disposable path changed 0 to 2 active IDs. Archiving one local duplicate and one managed-worktree duplicate retained the shared directory and sibling. m4 duplicate repair changed 31 active / 26 paths / 5 extras to 26 active.
- Source code commit `3472665ac` passed its normal pre-commit format, lint, and root typecheck after `npm run build:server` on m5. The m4 source overlay passed 16 focused import tests, root typecheck, and lint. The create-agent/import race test passed with the fix and failed against the previous commit (the workspace list was empty after rollback).
- Sol review `handoffs/th1-630-sol-final6.txt` in the scratch folder found no blocker in the final import change; previous Sol reviews found and drove fixes for nested registration, project deletion, and import races. The final 53-patch export has hash `b7b14f4aab4bec7f`, and patches 0001–0055 are byte-identical to the preceding candidate. Exact final 0056 on m4 applied as commit `960e7f92` and passed 17 import/launch, 22 registry, 27 archive-service and 1 nested-project tests; serial build:server, root typecheck and lint passed with clean status.
- A broader provisioning selection previously had one scratch assertion failure reproduced on the clean baseline; the earlier full `session.workspaces.test.ts` failures also reproduced on the exact-52 baseline. Do not call those suites green.

## Rollout and repair remaining

1. Source PR #5 merged as `d49f5c78` and patch PR #13 merged as `db37855e`; merged runtime and series files were compared by content with the reviewed heads. Linear TH1-630 remains In Progress for rollout and repair.
2. TH1-662 grouping agent on m4 appends 0057 on the merged release/source and patch-main heads, preserving 0001–0056 bytes. Its final checks are separate; do not build or deploy in parallel.
3. The documented patch-repo installer built a signed v0.11.2 bundle at `/Users/hteo/.paseo/worktrees/th1-630/release-v0.11.2-53/packages/desktop/release/mac-arm64/Paseo.app`: series hash `b7b14f4aab4bec7f`, asar SHA-256 `e8d5a69ec1dd0d4a0843e2e6c1569e48e95ee7111333ac226e51aeb23800c11e`, signing check 18 binaries, updater gate 27/27. This is build-only, not installed. Two other m5 agents and two m4 Fleet agents explicitly checkpointed/pushed/idled; TH1-662 remains active on m4. Settle this session, install m5 with one restart, verify version/hash/daemon/resumes/dispatchd, then install m4 only after TH1-662's pushed checkpoint and verify there.
4. Prove live-owner refusal, run guarded duplicate/missing-record repair m5 then m4, rehome worktree projects, apply approved grouping names, and move only eligible throwaway directories to `~/_to_delete`. Record final active/duplicate/missing counts in scratch `handoffs/TH1-630-root-cause.md` and `handoffs/STATUS.md`. Protect real projects and unpushed work.

Pre-rollout audit: m5 `local-build.json` only said `localBuild:true`, so its exact old series hash was not available; extracted app code had recovery 0048 but not uniqueness. m4 marker had v0.11.2 hash `a102a0aca08c259e` and lacked recovery/uniqueness. Patch main currently has 45 v0.11.2 entries including recovery 0048. Historical fork PRs #2/#3 target v0.10.3; #4 is a draft P0020 rescue on incompatible main. Patch PR #10 targets v0.10.3, #5 is draft desktop isolation. Do not merge those into this release series.
