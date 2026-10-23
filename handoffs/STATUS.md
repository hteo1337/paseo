TH1-1767 — https://linear.app/th1337/issue/TH1-1767 — hteo1337/paseo branch dispatch/TH1-1767, upstream base59b01b33f.
Done: reconciled launch/remotes; replayed70 patches on v0.12.0 in port/TH1-1767 (181e5b018); no production source edits or PRs.
Evidence: actual stuck transcript replay on m5's installed-byte-identical source yields idle/persistence=true/no run/no subagents/eligible=true/unloaded=1; native PID60624 still belongs to daemon6332.
Verification: manager suite268/268; server builds pass; patch signing checks2/2; upstream full typecheck and lint pass after postinstall dependency patches; no CI/native query/post-install proof.
Blocker: no failing import reproduction or observed live guard operand; upstream main has no idle-unload implementation (local0059). Detailed evidence and replay script are in handoffs/.
Next: obtain non-loading live guard/owned-close/subscription state before a failing test or fix; fork Sol review, adversarial gate, upstream PR and patch PR remain pending.
Patch repo: dispatch/TH1-1767 in /Users/hteo/.paseo/worktrees/TH1-1767-patches; no new payload; exporter --replayed rejects historical0002 after stable three-way replay.
Install on m5 ONLY after fix/review/series delivery (NOT RUN): PASEO_REPO="$HOME/Work/GitHub/paseo" PASEO_BUILD_WORKTREE="$HOME/.paseo/worktrees/TH1-1767-release-v0.12.0" "$HOME/Work/GitHub/paseo-app-patches/paseo-patched-update.sh" --tag v0.12.0 --force --wait
Limits: no install/restart or live mirror inspect/reload/archive, no model turn, no merge; root cause and implementation acceptance remain open.
