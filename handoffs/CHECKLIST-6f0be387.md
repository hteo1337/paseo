# TH1-662 — real project grouping

- [x] Inspect source/patch contracts, coordinate TH1-630 and recovery, create isolated issue branches and baseline targeted suites.
- [x] Persist optional project group metadata and rules; verify legacy records and TSV migration preserve names and disk paths.
- [x] Wire daemon/client/CLI grouping and workspace filter; verify real git identity resolution from TH1-630 and rule controls.
- [x] Render grouped cross-platform sidebar, counts/attention, Scratch and client-local collapse/live-agent filter; test grouped tree.
- [x] Run targeted tests, sequential build/typecheck/lint/format; inspect artifact and patch application at v0.11.2.
- [x] Export self-contained numbered patch, push branches/handoffs, open PRs and link Linear with rollout steps and residual needs.

Agent env was unset; id verified via m4 daemon agent listing. No restart/install/deploy authorized.

Evidence: contracts read, worktrees created, coordination sent; baseline registry20/sidebar5; protocol build passed; grouping registry26 passed (rules/persistence/manual-unset/TSV/startup controls).

Evidence: isolated CLI real-git E2E passed 1 selected test (26.26s), linked worktree and same-origin clone share projectId; differing remote remains separate. Root typecheck passed all workspaces; client/server/CLI builds passed sequentially; lint0. Sidebar tree tests8 pass with collapse, counts, attention, Scratch and live-agent controls.

Final exact-series evidence: 54 applied; 53 prior bytes preserved; registry31/app56/CLI9/real-Git E2E1 passed; serial builds, root typecheck/lint/format, web export passed. See combined-\* evidence and provenance.

Delivery evidence: source PR6 and patch PR15 are open/mergeable on the required merged bases; both branches pushed; Linear TH1-662 links both PRs, project paseo-ops, state In Review. Owner second rollout only.
