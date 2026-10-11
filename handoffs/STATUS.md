# Patch 0021 follow-up — 2026-09-27

Branch `fix/0021-synthetic-frame-model` contains commits `ea2782bfd`, `599983b23`, and `2442dbe13`; nothing was pushed. A Sonnet create with an early cached-null Claude runtime-info read reproduced a provider `agent.set_model` refusal before any synthetic frame. The real 01:09Z frame shape supplied by the user (`<synthetic>`, `rate_limit`, `isApiErrorMessage`, 429) could not itself resolve to Opus because `models.ts` rejects `<synthetic>`.

The manager now treats null provider model reports as unknown and preserves the prior/requested model in managed state. Claude reports unknown to `agent.session_opened` until options select a model, invalidates the cached unknown after option selection, and keeps the last observed model across a restart of the same conversation. The existing assistant guard remains for error frames carrying real-looking IDs; it did not explain the observed failure.

Focused files: 320/320 tests, baseline 318/318 before follow-up; initial new test failed at `AgentManager.registerSession` through `checkProviderModelChange`. `npm run build:server`, `npm run typecheck`, `npm run lint`, and `npm run format:check` passed. Final pre-commit hooks passed. `@getpaseo/*` resolution was verified inside this worktree. No push, app-patches, or installed app changes.

Review found and prompted fixes for conflating requested and observed models and for a query restart resetting a genuine observed model. A follow-up review noted that a fresh `/rewind` conversation retains the previous observed model until a new inference frame. That later real frame can produce a model switch, which matches the policy requirement to assess genuine inference changes; no synthetic or unknown frame does so. The review workspace was archived.
