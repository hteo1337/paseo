# TH1-661 — OpenCode confirm-review finding repaired

Issue: https://linear.app/th1337/issue/TH1-661 (In Review); PR #2 and patch PR #10 remain open.
Done: shutdown session.abort now has a 2s cap before server release/escalation; close still awaits release settlement. Earlier three fixes and semantic combinations were confirmed by Sol.
Branches: source feat/idle-agent-unload (fix 15ac6cc84), port th1-661-idle-unload-v0.11.2 (fix 3d581cf5e), patches feat/idle-agent-unload-v0103; v0.11/0061 regenerated.
Verify: affected recovery file 6/6 passes on both source and port; new test fails unchanged; port root typecheck:server once exit 0; scoped lint both 0 errors; 0061 applies and 33 payload blobs match.
Blockers: none for this repair delivery; same-reviewer confirmation pending. Prior baseline failures, CI and installed behavior remain unverified for this follow-up.
Next: same Sol reviewer briefly confirms the OpenCode item; all three branches/tag are pushed and Linear comment 917b6264-ceec-4a23-ae5f-5c7b6452042f records heads. Do not merge or install.
Limits: no full suite, app build, install or restart. Only affected OpenCode tests ran; exact results/transcripts in TH1-661-VERIFICATION.md.
decided: cap only abort acknowledgement and continue awaiting owned release; regenerate against the pinned 0060 prefix and preserve prior payloads/published tags.
