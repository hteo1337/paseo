# TH1-661 review repair and v0.11.2 port

PASEO_AGENT_ID is unset (checked with echo); using dispatched run ID d7bb5b3b48ff406ab303ac706081089c as unique checklist ID.

- [x] ACP shutdown RPC deadlines reach process escalation; focused regression proves a nonresponding peer.
- [x] Reload reaps retained descendants and clears their state before replacement; regression proves failed and successful cleanup.
- [x] Independent per-agent idle deadlines allow later agents and future sweeps; regression covers a stalled close.
- [x] Corrected feature port combines all five conflicts on release/v0.11.2-patches and regenerates config schema.
- [x] Affected server files tested and typecheck:server run once; exact results recorded.
- [x] v0.11 patch regenerated and application matches source payload while preserving scoped RPC repair.
- [x] Source, port and patch branches committed/pushed; STATUS updated and TH1-661 commented with last commits and Sol re-review next.

Evidence: source-positive 5 passed/357 skipped; original production controls each exit 1 (ACP one responsive pass/one timeout; Reload unexpectedly resolves; sweep timeout). Logs are recorded in handoffs/TH1-661-VERIFICATION.md.

Port/patch evidence: 286 focused passes, typecheck:server once exit 0, final server build exit 0; 58 patches git am -3 exit 0; all 32 exported payload files equal source; schema treatment differs only by the idle setting. Delivery is complete; Sol re-review is next.

Delivery evidence: source c930dff0a, port b663c5c4e and patch 9916276 pushed successfully; source/port/tag remote hashes inspected. Linear comment b8b5463e-e688-4b99-86e5-48802972bb35 records branches, implementation/delivery commits and next Sol re-review. Both PR descriptions updated.

## Requested status refresh — 2026-10-14

- [x] Inspect current handoff, verification artifact and published branch heads.
- [ ] Refresh STATUS with done, next, verification and blockers; format and commit.
- [ ] Push refreshed handoff, verify remote head and update Linear delivery comment.
