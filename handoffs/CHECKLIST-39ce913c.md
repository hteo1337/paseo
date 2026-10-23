# TH1-1767 diagnostics (scope approved 2026-10-23)

PASEO_AGENT_ID remains unset; own id was verified via dispatcher issue_status.

- [x] Source implementation logs every skipped resident's operands and known owners, defaults on, throttles identical state for 10 minutes, without touching clocks or loading agents.
- [x] One behavioural test fails without diagnostics and proves logging, throttle/disable controls and unchanged unload behaviour with diagnostics.
- [x] Re-export source into v0.12 patch0059; full series replays; repo validation once; relevant typecheck/lint/format pass.
- [ ] In progress: open one paseo-app-patches PR, obtain latest-Sol PR-ready review and required adversarial judgment/review; inspect artifacts and exact head.
- [ ] STATUS/Linear reflect diagnostic scope, exact build+install command and verification; all branches pushed; no install/restart/upstream PR.
