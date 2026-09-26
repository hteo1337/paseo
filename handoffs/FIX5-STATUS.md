# FIX5 — false Claude provider model

Repo: hteo1337/paseo; branch: fix/p0021-false-provider-model; base: f60f7c47c.
Root cause at base: packages/server/src/server/agent/providers/claude/agent.ts:4623
adopts SDK init.model into lastOptionsModel; :4276 emits model_changed even for
same-session init. AgentManager then invokes agent.set_model with source=provider.
Live evidence inspected on m5: ~/.paseo/daemon.log:3887 records the 14:04:03Z
Fix x refusal for claude-opus-5-5, source=set_model:provider; ~/.claude-work/settings.json
has model=opus. Claude transcript projects/-Users-hteo-Paseo-Sandbox-opus-guard/
69c3a67c-45de-498c-b321-4546e0e075e9.jsonl contains one assistant frame, Sonnet 5,
at 14:04:08.501Z. False init attribution is confirmed; SDK override timing is inferred.

Change: agent.ts:4635 ignores init model while retaining session/mode handling.
:4460 adopts models from foreground assistant frames and streamed message_start (:4487).
Reuses observed-model normalization; ignores synthetic/child frames and deduplicates.
A genuine Opus frame still reaches the manager's provider set_model policy and refusal.
Detection occurs at the first assistant evidence, not before provider inference.

Tests: agent.test.ts:3403 replaces the old init-is-effective assertion with two controls.
On unchanged provider code both fail: false Opus event at init; missing genuine Opus
assistant event. /tmp/fix5-red.log: 2 failed, 84 skipped; afterward 86/86 passed.
:3489 adds streaming, late-init, duplicate, synthetic and child isolation coverage.

Gate: SDK build, server typecheck, full workspace typecheck, lint (0 warnings/errors),
format and diff --check pass. Detached Vitest used --maxWorkers=1 and process-local
`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=tag.gpgSign GIT_CONFIG_VALUE_0=false`.
Scope: src/server/plugins + src/server/agent/agent-manager.test.ts +
src/server/agent/providers/claude; excludes `*.real.e2e.test.ts` and `*.local.e2e.test.ts`.
Base f60f7c47c: 51 files; 862 passed / 1 failed / 2 skipped (865), 144.20s.
Fixed: 51 files; 864 passed / 1 failed / 2 skipped (867), 192.55s; +2 tests net.
Both failures: connection-demand.e2e.test.ts, quiet fixture lacks requirements.paseo.
Logs: /tmp/fix5-{baseline,final}-tests.log; no failing file excluded.
Reviewed complete diff; no protocol, manager, SDK or generated-file changes.
Delivery: commit/push to fork only; no PR, installation or daemon restart.
