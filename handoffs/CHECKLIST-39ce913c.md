# TH1-1767 observer idle-clock fix

PASEO_AGENT_ID unset; dispatcher identifies this writer as39ce913c.

- [x] Read19:01Z evidence and identify the60-second all-agent observer from source plus ssh m5 daemon.log; preserve attribution in STATUS without changing that client.
- [x] One regression fails before fix: per-minute subscribe/unsubscribe and resident loading still allow unload after idleMs; active holds block, real uses reset.
- [x] Minimal source fix exported into existing v0.12 patch0059 on a new patch branch from main; full series apply, build, typecheck, lint, manager suite and patch validation verified.
- [x] New patch PR ready with latest Sol review and actual-diff risk decision/required adversarial review; exact head/artifacts inspected.
- [ ] STATUS/Linear reflect fix, observer identity, verification and m5 install command; all work pushed, no installation/restart/native changes.
