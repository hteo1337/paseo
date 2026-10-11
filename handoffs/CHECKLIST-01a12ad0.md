# TH1-661 adversarial re-review

PASEO_AGENT_ID is unset (checked with echo and Python); use CODEX_THREAD_ID prefix 01a12ad0 for this reviewer only. Existing source branch is explicitly requested and predates the continuity naming contract.

- [x] Inspect current source and patch PR artifacts and the 48b07f6 fix. Evidence: gh pr view both PRs; git show 48b07f6; stable patch-id 1127f516fec0533cb9a267349f7edf2a28aea78f matches source diff and downloaded 0045.
- [x] Record evidence and verdict for claim 1: live terminals and active work prevent unload. Nothing found in static review: manager.ts:1353/1393/2094, acp-agent.ts:2490, agent-prompt.ts:327, agent-loading.ts:67, manager.ts:1610.
- [x] Record evidence and verdict for claim 2: bounded shutdown and recoverable agents. STATUS findings 1–2: ACP close RPC never reaches escalation if it hangs; Reload skips idleReapPending cleanup. Evidence: inspected SDK response promise, provider close, manager barriers/reload, and session Reload handler.
- [x] Record evidence and verdict for claim 3: independent provider shutdown. STATUS finding 3 traces manager.ts:1405 and bootstrap.ts:604/610; OpenCode rejected-generation and daemon shutdown paths separately inspected.
- [x] Record evidence and verdict for claim 4: prompt/unload races. STATUS records nothing found for an independent normal send/load race, with exact leases, barriers, refusal and synchronous admission sites, and the stuck-close limitation.
- [x] Check 0045 applicability on v0.11.2 without installing it and describe required rebase. Evidence: two apply --check exits 1; two object-only merge-tree previews exit 1; exact conflict hunks inspected; m5 app plist returned 0.11.2; PR10 v0.11/series lacks 0045; updater selection and three-way mode read.
- [ ] Append review to STATUS, commit/push it, and comment on the project-assigned Linear issue.

Current: format/check documentation, commit/push review artifacts, then post Linear branch/head/next step and verify delivery. No new tests, mutations, negative controls, full suite, parallel builds, installation, or daemon restart.
