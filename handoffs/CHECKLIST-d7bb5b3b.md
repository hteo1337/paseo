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
- [x] Refresh STATUS with done, next, verification and blockers; format and commit.
- [x] Push refreshed handoff, verify remote head and update Linear delivery comment.

Status refresh evidence: f1aba77fb committed and pushed; git ls-remote confirmed its exact hash; Linear delivery comment b8b5463e updated. Formatting and git diff --check passed; no tests rerun.

## Repeated requested status refresh

- [x] Current source head e43462bc7 and port head b663c5c4e match their published refs; working tree is clean and operator notes are empty.
- [x] Refresh done / next / verify / blockers and commit the formatted handoff.
- [x] Push and verify the new source head; update Linear delivery record.

Repeat refresh evidence: 826434dfd committed/pushed and confirmed via git ls-remote; new Linear comment 24d6e72b-5959-4f84-af9d-893f3d9096f6 records delivery. Formatter and diff check passed.

## OpenCode remaining review finding

- [x] OpenCode close caps session.abort at two seconds and still awaits release/escalation; one existing-suite regression proves the stalled RPC reaches retained release.
- [x] Fix and test carried to v0.11.2; affected OpenCode file(s) run and typecheck:server run once with recorded results.
- [x] v0.11/0061 regenerated from source; prior payloads preserved and resulting payload matches corrected port.
- [x] All three branches pushed; STATUS and Linear record commits, evidence and same-reviewer confirmation next; no merge/install.

OpenCode evidence: new real-HTTP stalled-abort test failed unchanged (1 failed/5 skipped, release never reached), source recovery file 6/6 passed, port recovery file 6/6 passed; actual root typecheck:server once exit 0, scoped lint both exit 0. Release remains pending until the injected process terminator settles.

Patch evidence: regenerated export d3e4a1673; 0061 SHA256 2eb0ef379ed6070e30350729b8137495bfffac85334ea801c300487ffa4e198f; git am -3 on pinned 0060 prefix passed and resulting tree equals exported source; all 33 payload files match the corrected port, prior 57 payloads unchanged.

OpenCode delivery: source dd3878c1e, port fb342d893 and patches 37cc553 pushed and exact remote refs inspected, plus immutable corrected export tag. Combined port/tag push was rejected without reason; separate pushes succeeded. Linear comment 917b6264-ceec-4a23-ae5f-5c7b6452042f records all heads and same Sol confirmation next; PR descriptions updated.
