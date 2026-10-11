# TH1-630 — workspace uniqueness

Issue: https://linear.app/th1337/issue/TH1-630/eliminate-duplicate-active-paseo-workspaces-and-repair-m5m4-records; branch `fix/th1-630-workspace-uniqueness`.
Merged source PRs: https://github.com/hteo1337/paseo/pull/5 and /pull/7; merged patch PRs: https://github.com/hteo1337/paseo-app-patches/pull/13 and /pull/18; grouping source/patch PRs #6/#15.
Signed v0.11.2 55-patch series `35afe21e63eed092` is installed on m5 and m4; both asars SHA256 `56709818443ede74559591a2cb6682bc68df7aa336b99d169badc8caae5c6073`; workspace RPCs answer and dispatchd is connected.
Final m5 108 stored/visible active, 108 real paths, 0 duplicate groups, 0 missing dirs. Final m4 35/35/35/0/0, from direct pre-repair 45 active / 2 duplicate groups / 1 missing dir.
Disposable live-owner guarded archive refused on both hosts; repairs, Git-project rehome, scratch cleanup and grouping have receipts in `~/.paseo/ops-scratch/ws-clean/handoffs/TH1-630-root-cause.md` and `TH1-630-final-{m5,m4}.json`.
Next: janitor may retire this live ws-clean scratch workspace after this agent stops; Teo should classify ChatBot-OCR, leave KUBEARK workflow-engine untouched, and inspect ambiguous plastic-snake Git metadata.
Verification: compare both installed local-build.json markers and app.asar SHA256, `paseo workspace ls --json` locally and on `ssh teo-mbp-m4`, plus authenticated dispatchd health; see full historical log in `TH1-630-status-history.md`.
