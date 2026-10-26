# TH1-2057 source port
- Issue: https://linear.app/th1337/issue/TH1-2057; source branch port/TH1-2057-v0140; patch branch TH1-2057/v0140-port.
- Done: all 74 original commits rebased linearly onto v0.14.0; no original commit squashed or dropped.
- Done: upstream idle collector is the only production scheduler; local timeout, observation-safe activity, diagnostics and owned-process cleanup retained.
- Verify: source server/CLI builds, full workspace typecheck and lint pass after integration/dependency corrections; collector 20/20, app 75/75.
- Verify: desktop has the same two Node deprecation-output failures as baseline; broad server/CLI attempts incomplete; exact evidence in patch-repo handoffs/TH1-2057/VERIFICATION.md.
- Fixed: adversarial P2 stalled closes retain lifecycle ownership; collector bounds per-close and shutdown waits, skips pending identities, and records late outcomes once.
- Verify: ported production deadline regression red then green; manager/collector/hooks 325/325; server typecheck and lint pass; final argument-only shutdown deadline uses active candidate budget.
- Next: existing reviewer confirmation remains lead-owned; replay/hash/delivery evidence in patch-repo handoff; no agents authorized.
- Limits: source only; no native app build, install, updater installation, live configuration edits, restart or merge.
