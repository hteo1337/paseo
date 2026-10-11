import { mkdtemp, rm, writeFile, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { DaemonClient } from "../packages/server/src/server/test-utils/daemon-client.js";
import { createAgentCommand } from "../packages/server/src/server/agent/create-agent/create.js";
import { createTestLogger } from "../packages/server/src/test-utils/test-logger.js";
import { createTestPaseoDaemon } from "../packages/server/src/server/test-utils/paseo-daemon.js";

test("real daemon guard warns, refuses, and preserves dispatcher/operator/Moth", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "th1-728-guard-"));
  const mode = path.join(dir, "mode");
  const guard =
    "/Users/hteo/.paseo/worktrees/2h07vznk/th1-728-dispatch-guard/server/dispatch-guard.ts";
  await writeFile(mode, "warn");
  await mkdir(path.join(dir, "server"));
  await copyFile(guard, path.join(dir, "server/dispatch-guard.ts"));
  await writeFile(
    path.join(dir, "paseo-plugin.json"),
    JSON.stringify({ id: "dispatch-proof", requirements: { paseo: ">=0.8.0" } }),
  );
  await writeFile(
    path.join(dir, "index.server.ts"),
    `
import { readFileSync } from "node:fs";
import { applyDispatchGuard } from "./server/dispatch-guard.ts";
export default function contribute(server) {
  server.before("agent.create", ({request}) => {
    console.log(JSON.stringify({creation:request.creation}));
    return applyDispatchGuard(request,readFileSync(${JSON.stringify(mode)},"utf8"),line=>console.log(line));
  }); return ()=>{};
}`,
  );
  const daemon = await createTestPaseoDaemon({ daemonVersion: "0.11.2" });
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.11.2",
  });
  try {
    await client.connect();
    await client.fetchAgents({ subscribe: {} });
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(dir);
    const warned = await client.createAgent({ provider: "codex", cwd: dir, title: "direct warn" });
    expect(daemon.daemon.agentManager.getAgent(warned.id)?.config.systemPrompt).toContain(
      "[dispatch-guard] WARN:",
    );
    await writeFile(mode, "enforce");
    await expect(
      client.createAgent({ provider: "codex", cwd: dir, title: "direct refuse" }),
    ).rejects.toThrow("dispatch_run");
    const dependencies = {
      agentManager: daemon.daemon.agentManager,
      agentStorage: daemon.daemon.agentStorage,
      logger: createTestLogger(),
      providerSnapshotManager: { resolveCreateConfig: async () => ({}) },
    };
    const input = {
      kind: "mcp" as const,
      provider: "codex",
      cwd: dir,
      workspaceId: daemon.daemon.agentManager.getAgent(warned.id)?.workspaceId,
      title: "system",
      background: true,
      notifyOnFinish: false,
    };
    await expect(createAgentCommand(dependencies, input)).rejects.toThrow("dispatch_run");
    const system = await createAgentCommand(dependencies, { ...input, creationSource: "system" });
    expect(system.snapshot.id).toBeTruthy();
    const operator = await client.createAgent({
      config: { provider: "codex", cwd: dir, title: "operator" },
      labels: { direct: "operator" },
    });
    const dispatched = await client.createAgent({
      config: { provider: "codex", cwd: dir, title: "dispatch" },
      labels: { dispatch_task_id: "task", dispatch_branch: "th1-728/proof" },
    });
    const moth = await client.createAgent({
      config: { provider: "codex", cwd: dir, title: "moth" },
      callerAgentId: operator.id,
      labels: { moth_operation: "operation", moth_owner: "owner", moth_source: operator.id },
    });
    expect([operator.id, dispatched.id, moth.id].every(Boolean)).toBe(true);
    await expect(
      client.createAgent({
        config: { provider: "codex", cwd: dir, title: "moth mismatch" },
        callerAgentId: operator.id,
        labels: { moth_operation: "operation", moth_owner: "owner", moth_source: "wrong" },
      }),
    ).rejects.toThrow("dispatch_run");
    const logs = await client.getPluginLogs("dispatch-proof");
    const origins = logs
      .filter((x) => x.message.startsWith('{"creation":'))
      .map((x) => JSON.parse(x.message).creation);
    expect(
      origins.some(
        (x) =>
          x.source === "agent" &&
          x.callerAgentId === operator.id &&
          x.labels.moth_source === operator.id,
      ),
    ).toBe(true);
    console.log(
      "TH1-728 guard proof: WARN allowed+message; enforce refused; operator/dispatch/Moth allowed; mismatched Moth refused; real caller provenance observed; system allowed and callerless external MCP refused",
    );
  } finally {
    await client.close();
    await daemon.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
