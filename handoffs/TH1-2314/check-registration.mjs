// Run from the port worktree: node handoffs/TH1-2314/check-registration.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import {
  createLifecycleRegistration,
  pluginHookRegistry,
} from "@getpaseo/plugin/internal/lifecycle";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
for (const name of ["@getpaseo/plugin", "@getpaseo/plugin/server"]) {
  const resolved = require.resolve(name);
  console.log(`require.resolve(${JSON.stringify(name)}) = ${resolved}`);
  assert.ok(resolved.startsWith(root + path.sep));
}
const accounts =
  process.env.PASEO_ACCOUNTS_SOURCE ??
  path.join(process.env.HOME, "Work/GitHub/hteo1337/paseo-accounts");
const scratch = await mkdtemp(path.join(root, ".dev-registration-"));
const previousHome = process.env.PASEO_HOME;
process.env.PASEO_HOME = scratch;
const logs = [];
const originalLog = console.log;
console.log = (...args) => {
  logs.push(args.join(" "));
  originalLog(...args);
};
try {
  // Bundle unchanged consumer and prime only its daemon listing dependency with an empty
  // inventory. This prevents startup sweeps reaching the live daemon; lifecycle is real.
  const entry = `import contribute from ${JSON.stringify(path.join(accounts, "index.server.ts"))};
import { remember } from ${JSON.stringify(path.join(accounts, "server/daemon.ts"))};
remember({ paseo: { agents: { list: async () => ({ entries: [], pageInfo: { hasMore: false, nextCursor: null } }) } } });
export default contribute;`;
  const output = path.join(scratch, "accounts.mjs");
  await build({
    stdin: { contents: entry, resolveDir: root, sourcefile: "registration-entry.ts" },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "worktree-sdk",
        setup(builder) {
          builder.onResolve({ filter: /^@getpaseo\// }, (args) => ({
            path: require.resolve(args.path),
            external: true,
          }));
        },
      },
    ],
  });
  const { default: contribute } = await import(pathToFileURL(output));
  const registrations = [];
  const removed = [];
  const lifecycle = createLifecycleRegistration((name, handler) => {
    assert.equal(typeof handler, "function");
    registrations.push(name);
    return () => removed.push(name);
  });
  const expected = ["agent.set_model", "agent.turn_start", "agent.session_opened"];
  const seen = new Set();
  const server = {
    ...lifecycle,
    handle() {},
    before(name, handler) {
      const off = lifecycle.before(name, handler);
      assert.equal(typeof off, "function");
      if (expected.includes(name)) {
        seen.add(name);
        console.log(`before(${JSON.stringify(name)}) => unhook`);
      }
      return off;
    },
  };
  assert.throws(() => lifecycle.before("agent.nonexistent", () => {}), /Unknown before hook/);
  assert.throws(() => lifecycle.addHook("agent.nonexistent", () => {}), /Unknown lifecycle hook/);
  const cleanup = contribute(server);
  assert.equal(typeof cleanup, "function");
  for (const name of expected) {
    assert.ok(seen.has(name), `${name} reached real before()`);
    assert.equal(pluginHookRegistry[name].waits, true);
    lifecycle.addHook(name, async () => {})();
  }
  assert.ok(registrations.includes("agent.open.before"), "session_open keeps upstream alias");
  assert.equal(pluginHookRegistry["agent.turn.before"].waits, false);
  assert.equal(logs.filter((line) => line.includes("[opus-guard] hook unavailable")).length, 0);
  cleanup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(expected.every((name) => removed.includes(name)));
  console.log(
    "PASS: real accounts registration, both maps, unhooks, upstream aliases, waits, unknown-name controls; hook unavailable logs=0",
  );
} finally {
  console.log = originalLog;
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  await rm(scratch, { recursive: true, force: true });
}
