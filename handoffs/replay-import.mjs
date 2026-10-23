import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const [root, configDir, cwd, sessionId] = process.argv.slice(2);
if (!root || !configDir || !cwd || !sessionId) {
  throw new Error("Usage: node replay-import.mjs CHECKOUT CLAUDE_CONFIG_DIR CWD SESSION_ID");
}
const server = `${root}/packages/server/dist/server/server/agent`;
const { AgentManager } = await import(`${server}/agent-manager.js`);
const { AgentStorage } = await import(`${server}/agent-storage.js`);
const { ClaudeAgentClient } = await import(`${server}/providers/claude/agent.js`);
const { default: pino } = await import(`${root}/node_modules/pino/pino.js`);
const logger = pino({ level: "silent" });
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "TH1-1767-replay-"));
const client = new ClaudeAgentClient({
  logger,
  runtimeSettings: { env: { CLAUDE_CONFIG_DIR: configDir } },
  queryFactory: () => {
    throw new Error("No provider query permitted during history replay");
  },
  resolveBinary: async () => "/no-query",
});
// Keep availability at the external boundary; the real import/history/manager code runs.
client.isAvailable = async () => true;
const manager = new AgentManager({
  clients: { claude: client },
  registry: new AgentStorage(path.join(scratch, "agents"), logger),
  logger,
});
try {
  const agent = await manager.importProviderSession({
    provider: "claude",
    providerHandleId: sessionId,
    cwd,
    workspaceId: "isolated-replay",
  });
  console.log(
    JSON.stringify({
      lifecycle: agent.lifecycle,
      persistence: Boolean(agent.persistence),
      hasRun: manager.hasInFlightRun(agent.id),
      subagents: manager.listProviderSubagents(agent.id).map(({ id, status }) => ({ id, status })),
      eligible: manager.canUnloadIdleAgent(agent.id, agent),
      unloaded: await manager.unloadIdleAgents(1, Date.now() + 60_000),
    }),
  );
} finally {
  for (const agent of manager.listAgents()) await manager.closeAgent(agent.id);
  await fs.rm(scratch, { recursive: true, force: true });
}
