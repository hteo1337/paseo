# TH1-662 — real project grouping

- [x] Inspect source/patch contracts, coordinate TH1-630 and recovery, create isolated issue branches and baseline targeted suites.
- [x] Persist optional project group metadata and rules; verify legacy records and TSV migration preserve names and disk paths.
- [x] Wire daemon/client/CLI grouping and workspace filter; verify real git identity resolution from TH1-630 and rule controls.
- [x] Render grouped cross-platform sidebar, counts/attention, Scratch and client-local collapse/live-agent filter; test grouped tree.
- [ ] In progress: run targeted tests, sequential build/typecheck/lint/format; inspect artifact and patch application at v0.11.2.
- [ ] Export self-contained numbered patch, push branches/handoffs, open PRs and link Linear with rollout steps and residual needs.

Agent env was unset; id verified via m4 daemon agent listing. No restart/install/deploy authorized.

Evidence: contracts read, worktrees created, coordination sent; baseline registry20/sidebar5; protocol build passed; grouping registry26 passed (rules/persistence/manual-unset/TSV/startup controls).

Evidence: isolated CLI real-git E2E passed 1 selected test (26.26s), linked worktree and same-origin clone share projectId; differing remote remains separate. Root typecheck passed all workspaces; client/server/CLI builds passed sequentially; lint0. Sidebar tree tests8 pass with collapse, counts, attention, Scratch and live-agent controls.
