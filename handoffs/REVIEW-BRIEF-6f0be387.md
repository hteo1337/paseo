Read-only review for TH1-662 — Real Paseo project groups (paseo-ops).
Source /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-662-project-groups, branch feat/th1-662-project-groups, staged code diff vs 3cfe62f95; author still working, one writer only. Read ~/Paseo/RULES.md, source CLAUDE.md and packages/server/CLAUDE.md. No edits, no commits, no builds/tests, no daemon/app install/restart/deploy. Both hosts loaded; author owns serial verification. Latest Sol only, no Opus.

Attack these claims with concrete code evidence: (1) optional metadata/rules preserve legacy ungrouped projects and manual set/unset; TSV conversion only touches backed id/root/prefix rows and preserves base custom name, bf-\* canonical remote goes Nexus; (2) live group set/unset reaches subscriptions and all descriptors/CLI JSON; (3) shared native/web/desktop sidebar groups->projects->workspaces, counts/attention, default-collapsed Scratch, persistent client collapse, live-agent filtering and keyboard shortcut order agree.
Focus files new project-grouping.ts, project-groups.ts, workspace-registry.ts changes, session.ts changes, group.ts CLI, project-group-tree.ts, sidebar-model/projection/workspace-list, project-group-view-store.
Do not duplicate TH1-630 common-dir/origin uniqueness logic. Its base is 3cfe62f95; rollout owner2e198e3b will send integrated base; patch number pending55/56. Do not review unrelated existing patches or old handoff changes.
Evidence already observed: original registry20/sidebar5; current registry26/sidebar8; isolated real git + CLI + subscribed set/unset E2E1 pass (main/common-dir worktree/same-origin clone same project; same basename different remote distinct). Builds client/server/CLI, root typecheck/lint pass. CLI project suite7pass1fails unchanged delete assertion (ifEmpty argument), owner notified. Web bundle one worker in progress. Tests are in workspace-registry.test.ts, sidebar-projection.test.ts, cli-run-workspace-precedence.e2e.test.ts. Inspect them rather than rerunning.
Return findings ordered severity, file:line plus concrete trigger and impact. Explicitly say nothing found if none, and distinguish observation from uncertainty. Do not ask the author questions or write to GitHub/Linear. Reply in your final message only; parent will record the review artifact.
Required final response contract:

```dispatch-outcome
{"accomplished":"partial","evidence":{"artifacts":[],"commands":[]},"blocker_category":"none","remaining_work":[]}
```

Accomplished is yes/no/partial against verified review result, not end-of-turn. Commands record actual inspected commands/evidence. No claiming runtime UI acceptance.
