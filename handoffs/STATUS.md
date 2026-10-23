TH1-1767 — diagnostics scope approved 2026-10-23; patch repo branch dispatch/TH1-1767; no upstream PR.
Done: source implementation in hteo1337/paseo diag/TH1-1767 logs skipped operands/known holders; default-on PASEO_IDLE_UNLOAD_DIAG, identical-state10-minute throttle; no loader or clock calls added.
Verification: single new test red (missing log) then green; manager suite269/269; source full typecheck and targeted lint pass.
Done: regenerated0059; full70-entry replay matches tested source; patch validation once2/2; compiled real-Claude smoke logs owner/skip, preserves clock and unloads after release with zero queries.
Next: latest-Sol PR-ready review and actual-diff adversarial decision/review; patch branch head9a98d13; no upstream PR.
Source worktree: /Users/hteo/.paseo/worktrees/TH1-1767-port; patch worktree: /Users/hteo/.paseo/worktrees/TH1-1767-patches.
Install on m5 after review ONLY (NOT RUN): git -C "$HOME/Work/GitHub/paseo-app-patches" fetch origin dispatch/TH1-1767 && git -C "$HOME/Work/GitHub/paseo-app-patches" worktree add --detach "$HOME/.paseo/worktrees/TH1-1767-diag-patches" origin/dispatch/TH1-1767 && PASEO_REPO="$HOME/Work/GitHub/paseo" PASEO_BUILD_WORKTREE="$HOME/.paseo/worktrees/TH1-1767-diag-v0.12.0" "$HOME/.paseo/worktrees/TH1-1767-diag-patches/paseo-patched-update.sh" --tag v0.12.0 --force --wait
Limits: source-only; no install/restart/live mirror inspect/reload/archive/model turn/merge; original root cause awaits diagnostic deployment by Teo.
