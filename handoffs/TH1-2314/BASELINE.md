# Workspace background causation — independent baseline

Rejected experiment: the first baseline shared node_modules with the task worktree. Its first run exited 1 before collecting tests (TTLCache is not a constructor), not an assertion failure. A subsequent shared-dependency run and bisect are **discarded**, regardless of their result. No causal claim rests on them. Uncommitted work stayed in the task worktree, backed up as /tmp/TH1-2314-preserved-drift-before-baseline.patch; no stash or checkout there was used.

Independent experiment: detached /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline at 40e5f1bd4; removed both dependency symlinks after reading them; ran its own `npm ci` and `npm run build:server` (both exit 0). Both root and server dependencies are local installs. Enumerated non-relative imports with baseline-imports.mjs, traversing runtime TS sources and workspace JS exports, and including encountered source type imports. Full enumeration and resolution table follows. Every workspace path is inside the baseline; no dependency resolves into the task worktree.

Command: `node /Users/hteo/.paseo/worktrees/3eu1vvlp/c9c038efbba7/handoffs/TH1-2314/baseline-imports.mjs /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline` (helper contains only the scanner; it uses createRequire rooted in the baseline).

```text
checkout=/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline; runtime source/build modules traversed=106
Non-relative runtime specifiers (including conditional/dynamic literal imports):
@codemirror/language
@codemirror/legacy-modes/mode/clike
@codemirror/legacy-modes/mode/swift
@getpaseo/highlight
@getpaseo/plugin/internal/lifecycle
@getpaseo/plugin/server
@getpaseo/protocol/agent-labels
@getpaseo/protocol/branch-slug
@getpaseo/protocol/git-remote
@getpaseo/protocol/messages
@getpaseo/protocol/paseo-config-schema
@getpaseo/protocol/websocket-message-limit
@getpaseo/relay
@isaacs/ttlcache
@lezer/common
@lezer/cpp
@lezer/css
@lezer/go
@lezer/highlight
@lezer/html
@lezer/java
@lezer/javascript
@lezer/json
@lezer/lr
@lezer/markdown
@lezer/php
@lezer/python
@lezer/rust
@lezer/xml
@lezer/yaml
@modelcontextprotocol/sdk/server/zod-json-schema-compat.js
@noble/ciphers/chacha.js
@noble/curves/ed25519.js
@noble/hashes/hmac.js
@noble/hashes/sha2.js
base64-js
child_process
fs
fs/promises
lezer-elixir
node:async_hooks
node:child_process
node:crypto
node:fs
node:fs/promises
node:net
node:os
node:path
node:timers
node:timers/promises
node:util
p-limit
p-throttle
path
pino
strip-ansi
tree-kill
tweetnacl
util
vitest
which
zod

Workspace resolution table (runtime imports plus source type imports; from baseline server package):
@getpaseo/highlight	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/highlight/dist/index.js	LOCAL
@getpaseo/plugin/internal/lifecycle	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/plugin/dist/server/lifecycle.js	LOCAL
@getpaseo/plugin/server	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/plugin/dist/server/index.js	LOCAL
@getpaseo/protocol/agent-labels	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/agent-labels.js	LOCAL
@getpaseo/protocol/branch-slug	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/branch-slug.js	LOCAL
@getpaseo/protocol/git-remote	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/git-remote.js	LOCAL
@getpaseo/protocol/messages	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/messages.js	LOCAL
@getpaseo/protocol/paseo-config-schema	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/paseo-config-schema.js	LOCAL
@getpaseo/protocol/websocket-message-limit	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/protocol/dist/websocket-message-limit.js	LOCAL
@getpaseo/relay	/Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/relay/dist/index.js	LOCAL
workspace resolution failures=0

```

At 40e5f1bd4, `(cd packages/server && npx vitest run src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts)`:

```text
npm notice run paseo@0.15.0 npx
npm notice run 'vitest' run src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts

 RUN  v4.1.6 /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/server


 Test Files  1 passed (1)
      Tests  43 passed (43)
   Start at  01:36:17
   Duration  730ms (transform 351ms, setup 18ms, import 559ms, tests 84ms, environment 0ms)


```

Checked out 6a72342a1 in the detached baseline. Its full build reproduces TS1117 (duplicate createdAt), exit 2; never claimed green. To measure the runtime assertion without old dist artifacts, the runtime-build helper cleans and builds protocol, relay, highlight and plugin at each tested revision, then verifies the full local resolution table. The known protocol TS1117 still emits fresh valid JS with both same-value properties; it is allowed **only as an experiment prerequisite**, never a build success. Any other build error returns 125 (skip). All required runtime files must resolve after the clean build. No source edits, current-checkout builds, or shared workspace packages are used.

At independently rebuilt 6a72342a1, the same full test-file command exited 1 with exactly the upstream visible.background assertion failing (50 passed/1 failed):

```text
npm notice run paseo@0.15.0 npx
npm notice run 'vitest' run src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts

 RUN  v4.1.6 /Users/hteo/.paseo/worktrees/3eu1vvlp/th1-2314-baseline/packages/server

stdout | src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts
[dotenv@17.3.1] injecting env (0) from .env.test -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }
[dotenv@17.3.1] injecting env (0) from ../.env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`

 ❯ src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts (51 tests | 1 failed) 189ms
   × background workspace creation preserves hooks, inheritance and durable visibility 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts > background workspace creation preserves hooks, inheritance and durable visibility
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/server/session/workspace-provisioning/workspace-provisioning-service.test.ts:323:30
    321|   expect(parent.background).toBe(true);
    322|   expect(child.background).toBe(true);
    323|   expect(visible.background).toBe(false);
       |                              ^
    324|   expect(human.background).toBe(false);
    325|   expect(events).toEqual(Array(4).fill("workspace.create.after"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 50 passed (51)
   Start at  01:37:36
   Duration  821ms (transform 335ms, setup 20ms, import 546ms, tests 189ms, environment 0ms)


```

Ran `git bisect start 6a72342a1 40e5f1bd4` then `git bisect run /tmp/TH1-2314-bisect-independent.sh`. Script and per-revision runtime clean-build logs, test logs, and resolution tables are in evidence/. All workspace resolution tables have failures=0. Actual build return codes (including protocol duplicate-field errors) are retained.

```text
running '/tmp/TH1-2314-bisect-independent.sh'
909c21d08 test exit 0; resolution table and fresh runtime build logs recorded
Bisecting: 2 revisions left to test after this (roughly 2 steps)
[aefd229855e9c57c01c50052925b3feaa76d80ea] fix(server): reuse active workspace for canonical directory
running '/tmp/TH1-2314-bisect-independent.sh'
aefd22985 test exit 1; resolution table and fresh runtime build logs recorded
Bisecting: 0 revisions left to test after this (roughly 1 step)
[89570985d43c3dfa4e9b748e2b1b3ada6a58d7da] fix(server): reuse the active workspace for a directory on agent create
running '/tmp/TH1-2314-bisect-independent.sh'
89570985d test exit 0; resolution table and fresh runtime build logs recorded
aefd229855e9c57c01c50052925b3feaa76d80ea is the first bad commit
commit aefd229855e9c57c01c50052925b3feaa76d80ea
Author: t <t@t>
Date:   Sun Oct 11 13:08:44 2026 +0300

    fix(server): reuse active workspace for canonical directory

 handoffs/STATUS.md                                 | 22 +++++++
 .../cli-run-workspace-precedence.e2e.test.ts       | 18 +++++-
 .../open-project-missing-directory.e2e.test.ts     | 26 +++++++++
 packages/server/src/server/session.ts              |  1 +
 .../workspace-provisioning-service.test.ts         | 50 +++++++++++++++-
 .../workspace-provisioning-service.ts              | 18 +++---
 packages/server/src/server/websocket-server.ts     |  1 +
 .../workspace-archive-record-scoped.e2e.test.ts    | 68 ++++++++++++++--------
 .../server/src/server/workspace-directory.test.ts  | 45 ++++++++++++++
 packages/server/src/server/workspace-directory.ts  | 35 ++++++++---
 .../server/src/server/workspace-registry.test.ts   | 43 ++++++++++++++
 packages/server/src/server/workspace-registry.ts   | 35 ++++++++++-
 .../workspace-same-cwd-isolation.e2e.test.ts       | 45 +++-----------
 13 files changed, 324 insertions(+), 83 deletions(-)
 create mode 100644 handoffs/STATUS.md
bisect found first bad commit

```

Verdict: **our workspace cluster caused the failure**; no plain-upstream baseline is needed on this branch of the requested experiment. First bad commit aefd229855e9c57c01c50052925b3feaa76d80ea (patch 0048), parent 89570985d passes all 44 tests; first-bad log fails the same upstream visible.background assertion.

Exact causal hunk:

```diff
commit aefd229855e9c57c01c50052925b3feaa76d80ea
Author: t <t@t>
Date:   Sun Oct 11 13:08:44 2026 +0300

    fix(server): reuse active workspace for canonical directory

diff --git a/packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts b/packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts
index f9629bc00..71e4e0c48 100644
--- a/packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts
+++ b/packages/server/src/server/session/workspace-provisioning/workspace-provisioning-service.ts
@@ -268,11 +268,11 @@ export function createWorkspaceProvisioningService(deps: {
       updatedAt: timestamp,
       background: await resolveBackground(context),
     });
-    await workspaceRegistry.upsert(workspace, {
-      expectsInitialAgent: context?.expectsInitialAgent,
-    });
-    emitWorkspaceCreated(workspace);
-    return workspace;
+    const claimed = await workspaceRegistry.getOrCreateActiveByCwd(workspace, { expectsInitialAgent: context?.expectsInitialAgent });
+    if (claimed.created) {
+      emitWorkspaceCreated(claimed.workspace);
+    }
+    return claimed.workspace;
   }

   async function createWorkspaceForWorktree(
@@ -305,11 +305,13 @@ export function createWorkspaceProvisioningService(deps: {
       ...(input.untrustedSource ? { untrustedSource: input.untrustedSource } : {}),
       background: await resolveBackground(input),
     });
-    await workspaceRegistry.upsert(workspace, {
+    const claimed = await workspaceRegistry.getOrCreateActiveByCwd(workspace, {
       expectsInitialAgent: input.expectsInitialAgent,
     });
-    emitWorkspaceCreated(workspace);
-    return workspace;
+    if (claimed.created) {
+      emitWorkspaceCreated(claimed.workspace);
+    }
+    return claimed.workspace;
   }

   function emitWorkspaceCreated(workspace: PersistedWorkspaceRecord): void {

```

The resolver already distinguishes false from undefined; the new atomic claim discarded the freshly computed background flag by returning a pre-existing workspace. Restore upstream explicit creation semantics; preserve atomic reuse for implicit path opening/create-agent. The upstream background test was compared as a complete block with v0.15.0 and is unchanged (SHA256 a9bd2275cfa2d201b63d175bd77cced227aa775c96c29732e7c7dc6ca686a538). Only local reuse/rehoming tests are moved to the implicit-opening API; their reuse assertions remain active. No upstream assertion was removed or relaxed.
