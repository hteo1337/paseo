import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { expect, test } from "vitest";
import { createPaseoApi } from "@getpaseo/client";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import { AgentStorage } from "../agent/agent-storage.js";
import { buildSessionConfig } from "../persistence-hooks.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";

test("SDK MCP selection survives the daemon wire, provider preparation and durable reload", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-mcp-selection-wire-"));
  const canonicalHome = await realpath(directory);
  const launched: AgentSessionConfig[] = [];
  const daemon = await createTestPaseoDaemon({
    mcpEnabled: false,
    agentClients: createTestAgentClients({
      supportsMcpServers: true,
      beforeCreateSession: async (config) => {
        launched.push(structuredClone(config));
      },
    }),
  });
  const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
  const api = createPaseoApi(client);
  try {
    await client.connect();
    expect(api.agents.supportsMcpServerEnabled).toBe(true);
    const workspace = await api.workspaces.create({
      source: { kind: "directory", path: directory },
    });
    const selection = { inherited: false, selected: true };
    const agent = await workspace.agents.create({
      config: {
        provider: "codex",
        mcpServerEnabled: selection,
        expectedCodexHome: canonicalHome,
        options: { approval_policy: "on-request", sandbox_mode: "read-only" },
      },
    });
    expect(launched).toHaveLength(1);
    expect(launched[0]).toMatchObject({
      provider: "codex",
      mcpServerEnabled: selection,
      expectedCodexHome: canonicalHome,
      providerOptions: { approval_policy: "on-request", sandbox_mode: "read-only" },
    });
    expect(daemon.daemon.agentManager.getAgent(agent.id)?.config).toMatchObject({
      mcpServerEnabled: selection,
      expectedCodexHome: canonicalHome,
    });
    await daemon.daemon.agentManager.flush();
    await daemon.daemon.agentStorage.flush();
    const records = await new AgentStorage(
      daemon.config.agentStoragePath,
      pino({ level: "silent" }),
    ).list();
    const record = records.find((entry) => entry.id === agent.id);
    expect(record?.config).toMatchObject({
      mcpServerEnabled: selection,
      expectedCodexHome: canonicalHome,
    });
    if (!record) throw new Error("Created fixture agent was not persisted");
    expect(buildSessionConfig(record)).toMatchObject({
      mcpServerEnabled: selection,
      expectedCodexHome: canonicalHome,
    });
  } finally {
    await api.dispose();
    await client.close();
    await daemon.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
