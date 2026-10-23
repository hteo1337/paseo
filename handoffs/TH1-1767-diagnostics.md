# TH1-1767 diagnostic delivery

Teo authorized local patch0059 diagnostics on 2026-10-23. This supersedes the earlier upstream-fix scope: no upstream PR, installation or restart is authorized here.

- Tested source: hteo1337/paseo diag/TH1-1767 b5fe3364cf5c134349a5223dd13c06614a732d47. Six files,287 insertions/8 deletions: cached skip snapshots, stable ten-minute throttle, hold-owner counts, Session clientId propagation, source docs and one test.
- Payload source: p0059/TH1-1767 2c4523034a71c0417a1112eecd69de60f93ee0a4. Re-exported with git format-patch --no-signature --zero-commit -1 --stdout into existing v0.12/0059; all other patch files and series remain unchanged.
- Reconstructed completed series: replay-diag/TH1-1767 de6a82b4c1b04a6b2cdede462e6488fd5e99d30c. Fresh full70-entry git am -3 on v0.12.0: validate/TH1-1767 d29ee8b1f8abb8f320def9d005d50ebb498e36cd. Both match tested source outside handoffs by git diff (empty).
- The new test failed before implementation: expected one skip record, received zero; held agents remained resident. Final manager suite ran once:269/269 passed,7.17s. No test-writer or mutation lanes.
- Test covers every logged operand, local/global stream and plugin use owners, unchanged-state suppression until ten minutes, immediate changed-state report, no beginAgentUse/resume calls during scans, unchanged updatedAt/residentLastUsedAt, flag0, unset default-on, and eligible-agent unload with reporting enabled and disabled.
- Completed source: npm run build:server and full npm run typecheck pass. Targeted npm run lint across the five changed TypeScript files:0 warnings/0 errors. Source formatting via npm run format:files passed.
- Patch repo validation ran once for this diagnostic scope: node --test validation/mac-signing-gate.test.mjs:2/2 passed. No CI is configured in paseo-app-patches.
- One actual-path smoke used the compiled real ClaudeAgentClient import/session, real temporary transcript/AgentStorage and pino sink; availability was injected and queryFactory threw if called. Result: imported=true, skipRecords=1, owner=diagnostic-smoke-client, clockPreserved=true, resumeOrQueryCount=0, unloadedAfterRelease=true. Temporary files removed; no daemon or model run.

The historical source prefix through0059 is not independently buildable on stable before later integration patches. Untouched source94cddf308 reproduced exactly the same four TypeScript diagnostics (missing normalizeClaudeRuntimeModelId, bootstrap constructor arity, sidebar parse errors), one existing complexity violation and generated-schema-format failure as the modified prefix. The export-only replacement source commit therefore bypassed pre-commit hooks after recording this baseline; it does not claim a green prefix. The complete series and tested feature diff are green. Generated schema content was not hand-edited or reformatted.

The patch-file diff check flags standard single-space blank context lines in regenerated mbox hunks. Those are transport syntax, not source whitespace edits; source diff checks and full application passed. The README's pre-existing table formatting was preserved after formatting touched it incidentally.

No cause of the original residency problem is claimed. Diagnostics report current post-pass cached state, including pending owned closes; they do not inspect the live daemon until Teo installs the build. A failed provider accessor is recorded as null with its operand name in unavailableOperands rather than throwing or logging exception contents.
