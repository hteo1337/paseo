# Existing mixed commits retained for lead cleanup

No published history rewritten. All remaining source and handoff commits are separate. Run `python3 handoffs/TH1-2314/commit-inventory.py` on the final HEAD for measured totals; these four mixed commits predate the corrected rule.

## ca366806fddcb7cc868c8a61898c02f63c561478 — fix(port): reconcile phase-one patches with v0.15 APIs

Source paths (18):

- `packages/app/src/components/question-form-card.browser.test.tsx`
- `packages/app/src/components/sidebar/sidebar-nav-rows.tsx`
- `packages/app/src/composer/index.tsx`
- `packages/app/src/composer/input/desktop-keys.test.ts`
- `packages/app/src/composer/input/desktop-keys.ts`
- `packages/app/src/composer/input/input.tsx`
- `packages/app/src/composer/prompt-suggestions/chips.tsx`
- `packages/server/src/server/agent/agent-manager.test.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/providers/claude/agent.ts`
- `packages/server/src/server/auto-archive-on-merge/archive-if-safe.test.ts`
- `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts`
- `packages/server/src/server/bootstrap.ts`
- `packages/server/src/server/config.ts`
- `packages/server/src/server/daemon-config-store.ts`
- `packages/server/src/server/plugins/lifecycle/handlers.test.ts`
- `packages/server/src/server/plugins/lifecycle/index.ts`
- `packages/server/src/server/session.ts`

## aefd229855e9c57c01c50052925b3feaa76d80ea — fix(server): reuse active workspace for canonical directory

Source paths (12):

- `packages/server/src/server/cli-run-workspace-precedence.e2e.test.ts`
- `packages/server/src/server/daemon-e2e/open-project-missing-directory.e2e.test.ts`
- `packages/server/src/server/session.ts`
- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts`
- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts`
- `packages/server/src/server/websocket-server.ts`
- `packages/server/src/server/workspace-archive-record-scoped.e2e.test.ts`
- `packages/server/src/server/workspace-directory.test.ts`
- `packages/server/src/server/workspace-directory.ts`
- `packages/server/src/server/workspace-registry.test.ts`
- `packages/server/src/server/workspace-registry.ts`
- `packages/server/src/server/workspace-same-cwd-isolation.e2e.test.ts`

## 0fd243938c05a3865131f570daa6a5a4dff6c5ae — fix(port): preserve upstream workspace creation and repair drift

Source paths (10):

- `docs/agent-lifecycle.md`
- `packages/protocol/src/messages.ts`
- `packages/server/src/server/bootstrap.ts`
- `packages/server/src/server/session.ts`
- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts`
- `packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts`
- `packages/server/src/server/test-fixtures/reconciliation-registries.ts`
- `packages/server/src/server/workspace-archive-service.ts`
- `packages/server/src/server/workspace-directory.ts`
- `packages/server/src/server/workspace-registry.ts`

## 2209adc04d0e618ac3504d8a9230a2e4ed093f8f — chore(TH1-2314): checkpoint verified RPC authority cluster

Source paths (1):

- `packages/server/src/server/plugins/runtime.ts`
