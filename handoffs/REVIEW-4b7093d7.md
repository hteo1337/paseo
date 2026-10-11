# TH1-662 independent Sol review

Reviewer 4b7093d7-f7d4-421b-8203-c6783a0c21d7, observed codex-auto/gpt-6.1-sol high, review tier, same worktree. Dispatched through /Users/hteo/.codex/skills/paseo-dispatch/SKILL.md. No reviewer edits/builds/tests/installs/external writes.

Four inspections found and resolved six P2 findings: stale reconciliation upsert erased manual grouping; cross-host grouping masked divergent assignments; same-name metadata disagreed; mutable group names invalidated project preference keys; client-side defaults read/write raced; empty/fully pinned hosts disappeared beside occupied equivalent repositories.

Final verdict: "Nothing found: no merge blockers in the last diffs." Reviewer inspected the empty/pinned-host partition and assignment helper. Static review only; runtime UI acceptance not established by this review.

Final design: atomic registry merge preserves current group/source; daemon config catalog normalizes same-name metadata; CLI omitted fields remain omitted and resolve inside the serialized server mutation; stable repository viewKey retains saved filters/collapse/order; shared tree partitions host assignments while preserving empty/pinned creation targets.

Parent-produced controls: stale snapshot and group catalog controls each differed and failed an assertion with exit1. New default-inheritance control (force omitted defaults0/false) fails queued inheritance; restoring initial flat project-group tree fails host-specific assignment; restoring group-dependent identity fails stable preference keys; omitting occupied projects' empty hosts fails retained Fleet placement. Every control differed from treatment, failed with exit1, and restored treatment in finally. Initial protocol-only negative control was invalid because imports consume compiled declarations/runtime; it exited0 and was rejected as evidence, replaced by the actual server mutation control.

Positive results: server registry29, app structure6/sidebar10=16. Logs under handoffs/evidence/; final source/series integration recorded separately in STATUS.md.
