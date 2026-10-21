/** Opt-in real MCP-startup probe. Existing account only; no turns, installs or live daemon.
 * TEST_CODEX_HOME=/existing/home TEST_CODEX_BINARY=/path/codex TEST_PYTHON_BINARY=/path/python3 npx tsx scripts/probe-codex-mcp-selection.mts
 * Requires Python3.11+ for names-only TOML projection. Prints fixture names/counts only.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import pino from "pino";
import { CodexAppServerAgentSession } from "../packages/server/src/server/agent/providers/codex-app-server-agent.js";
const home = process.env.TEST_CODEX_HOME;
if (!home)
  throw new Error("Set TEST_CODEX_HOME to an existing account home. No credentials are copied.");
const binary = process.env.TEST_CODEX_BINARY ?? "codex";
const python = process.env.TEST_PYTHON_BINARY ?? "python3";
const names: string[] = JSON.parse(
  execFileSync(
    python,
    [
      "-I",
      "-c",
      'import tomllib,json,sys;print(json.dumps(list(tomllib.load(open(sys.argv[1],"rb")).get("mcp_servers",{}))))',
      join(home, "config.toml"),
    ],
    { encoding: "utf8" },
  ),
);
const root = mkdtempSync("/tmp/paseo-native-runtime-");
const script = join(root, "fixture.py");
writeFileSync(
  script,
  `import sys,json,pathlib,os\npathlib.Path(sys.argv[1]).open("a").write(json.dumps({"name":sys.argv[2],"pid":os.getpid(),"ppid":os.getppid()})+"\\n")\nfor line in sys.stdin:\n try:\n  r=json.loads(line);m=r.get("method");result={"protocolVersion":"2025-03-26","capabilities":{"tools":{}},"serverInfo":{"name":"fixture","version":"1"}} if m=="initialize" else {"tools":[{"name":"fixture_tool","description":"Fixture only","inputSchema":{"type":"object","properties":{}}}]} if m=="tools/list" else {}\n  if "id" in r:print(json.dumps({"jsonrpc":"2.0","id":r["id"],"result":result}),flush=True)\n except Exception:pass\n`,
);
let stage = "setup";
const sessions: CodexAppServerAgentSession[] = [];
const children: ReturnType<typeof spawn>[] = [];
const markerPids: number[] = [];
const bounded = async <T,>(task: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Runtime probe timed out")), 45000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (const selected of ["fixture_a", "fixture_b"]) {
    const log = join(root, selected + ".starts");
    const fixture = (name: string) => ({
      type: "stdio" as const,
      command: python,
      args: [script, log, name],
    });
    const config = {
      provider: "codex",
      cwd: root,
      mcpServers: {
        fixture_a: fixture("fixture_a"),
        fixture_b: fixture("fixture_b"),
        "coordination-fixture": fixture("coordination-fixture"),
        "later-hook-fixture": fixture("later-hook-fixture"),
      },
      mcpServerEnabled: {
        ...Object.fromEntries(names.map((name) => [name, false])),
        fixture_a: selected === "fixture_a",
        fixture_b: selected === "fixture_b",
      },
      expectedCodexHome: realpathSync(home),
    };
    const session = new CodexAppServerAgentSession(
      config,
      null,
      pino({ level: "silent" }),
      async () => {
        const child = spawn(binary, ["app-server"], {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, CODEX_HOME: home },
          detached: true,
        });
        children.push(child);
        return child as ChildProcessWithoutNullStreams;
      },
      {
        codexHome: home,
        environment: { ...process.env, CODEX_HOME: home } as Record<string, string>,
      },
      true,
    );
    sessions.push(session);
  }
  stage = "connect-and-start";
  await bounded(
    Promise.all(
      sessions.map(async (session) => {
        await session.connect();
        await (session as unknown as { ensureThread(): Promise<void> }).ensureThread();
      }),
    ),
  );
  await delay(5000);
  for (const [index, selected] of ["fixture_a", "fixture_b"].entries()) {
    const rows = readFileSync(join(root, selected + ".starts"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    markerPids.push(...rows.map((row) => row.pid));
    assert.deepEqual(rows.map((row) => row.name).sort(), ["coordination-fixture", selected].sort());
    assert.ok(
      rows.every((row) => row.ppid === children[index].pid),
      "MCP fixture must be direct child of its own app-server",
    );
    stage = "own-process-tree";
    const processRows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number));
    const directChildren = processRows
      .filter(([, parent]) => parent === children[index].pid)
      .map(([pid]) => pid)
      .sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        session: index,
        ownedDirectChildren: directChildren.length,
        fixtureChildren: rows.length,
      }),
    );
    const extraChildren = directChildren.filter((pid) => !rows.some((row) => row.pid === pid));
    if (extraChildren.length)
      console.log(
        JSON.stringify({
          session: index,
          otherOwnedChildExecutables: execFileSync(
            "ps",
            ["-p", extraChildren.join(","), "-o", "comm="],
            { encoding: "utf8" },
          )
            .trim()
            .split("\n")
            .map((name) => basename(name.trim())),
        }),
      );
    interface Row {
      name: string;
      tools?: Record<string, unknown>;
    }
    const internals = sessions[index] as unknown as {
      client: { request(method: string, params: unknown): Promise<{ data?: Row[] }> };
    };
    const threadId = sessions[index].describePersistence()!.sessionId;
    const status = await bounded(internals.client.request("mcpServerStatus/list", { threadId }));
    const fixtureRows = (status.data ?? []).filter(
      (row: Row) => row.name.startsWith("fixture_") || row.name === "coordination-fixture",
    );
    assert.ok(
      fixtureRows.some(
        (row: Row) => row.name === selected && Object.keys(row.tools ?? {}).length === 1,
      ),
      "Selected fixture tool must be listed for thread",
    );
    assert.ok(
      fixtureRows
        .filter((row: Row) => row.name === (selected === "fixture_a" ? "fixture_b" : "fixture_a"))
        .every((row: Row) => Object.keys(row.tools ?? {}).length === 0),
      "Other agent tools must not leak",
    );
    assert.ok(
      (status.data ?? [])
        .filter((row) => names.includes(row.name))
        .every((row) => Object.keys(row.tools ?? {}).length === 0),
      "Inherited tools must stay disabled",
    );
    console.log(
      JSON.stringify({
        session: index,
        starts: rows.map((row) => row.name).sort(),
        threadScopedTools: fixtureRows.map((row: Row) => ({
          name: row.name,
          tools: Object.keys(row.tools ?? {}).length,
        })),
        inheritedExplicitlyDisabled: names.length,
        otherMcpServers: (status.data ?? [])
          .filter(
            (row) =>
              !names.includes(row.name) &&
              !row.name.startsWith("fixture_") &&
              row.name !== "coordination-fixture" &&
              Object.keys(row.tools ?? {}).length > 0,
          )
          .map((row) => ({
            name: /^[A-Za-z_][A-Za-z0-9_.-]{0,120}$/.test(row.name)
              ? row.name
              : "redacted-metadata",
            tools: Object.keys(row.tools ?? {}).length,
          })),
        otherEnabledMcpServers: (status.data ?? []).filter(
          (row) =>
            !names.includes(row.name) &&
            !row.name.startsWith("fixture_") &&
            row.name !== "coordination-fixture" &&
            Object.keys(row.tools ?? {}).length > 0,
        ).length,
      }),
    );
  }
  let spawned = false;
  assert.throws(
    () =>
      new CodexAppServerAgentSession(
        {
          provider: "codex",
          cwd: root,
          mcpServerEnabled: {},
          expectedCodexHome: home + "/changed",
        },
        null,
        pino({ level: "silent" }),
        async () => {
          spawned = true;
          throw Error("must not spawn");
        },
        { codexHome: home },
      ),
    /account routing changed/,
  );
  assert.equal(spawned, false);
  console.log(JSON.stringify({ accountDriftRejectedBeforeSpawn: true }));
} catch {
  console.error(
    `Runtime MCP probe failed at ${stage}; raw diagnostics withheld to protect account configuration.`,
  );
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map((session) => session.close()));
  for (const child of children)
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
  for (const selected of ["fixture_a", "fixture_b"]) {
    try {
      markerPids.push(
        ...readFileSync(join(root, selected + ".starts"), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line).pid),
      );
    } catch {}
  }
  await delay(1000);
  const groups = new Set(children.map((child) => child.pid).filter(Boolean));
  const remainingGroupPids = execFileSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([, pgid]) => groups.has(pgid))
    .map(([pid]) => pid);
  const survivors = [...new Set([...remainingGroupPids, ...markerPids.filter(alive)])];
  console.log(JSON.stringify({ ownedProcessesRemaining: survivors.length }));
  rmSync(root, { recursive: true, force: true });
  assert.equal(survivors.length, 0);
}
