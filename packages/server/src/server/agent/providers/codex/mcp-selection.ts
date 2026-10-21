import { realpathSync } from "node:fs";
import path from "node:path";
import type { AgentSessionConfig } from "../../agent-sdk-types.js";

export function isProtectedCoordinationServer(name: string): boolean {
  return /(^paseo$|dispatch|orchestrat|coordination|memory|tmux|semif|linear|hermes|^MCP_OPS$|^MCP_AUTHORING$)/i.test(
    name,
  );
}

/** Keep all MCP overrides in one table: Codex replaces earlier CLI override tables. */
export function applyCodexMcpSelection(
  config: Record<string, unknown>,
  session: Pick<AgentSessionConfig, "mcpServerEnabled" | "mcpServers">,
): void {
  const selection = session.mcpServerEnabled;
  if (selection === undefined) return;
  if (Object.keys(config).some((key) => key.startsWith("mcp_servers."))) {
    throw new Error("MCP selection cannot be combined with dotted MCP overrides");
  }
  const existing = config.mcp_servers;
  const entries = isRecord(existing) ? Object.entries(existing) : [];
  const servers = new Map<string, unknown>(entries);
  for (const name of Object.keys(session.mcpServers ?? {})) {
    if (!Object.hasOwn(selection, name) && !isProtectedCoordinationServer(name)) {
      const injected = servers.get(name);
      servers.set(name, { ...(isRecord(injected) ? injected : {}), enabled: false });
    }
  }
  for (const [name, enabled] of Object.entries(selection)) {
    if (
      !name ||
      name.length > 200 ||
      Array.from(name).some((character) => character.charCodeAt(0) < 32)
    ) {
      throw new Error("Unsupported MCP server identity in selection");
    }
    const injectedCoordination =
      Object.hasOwn(session.mcpServers ?? {}, name) && isProtectedCoordinationServer(name);
    if (!enabled && injectedCoordination) {
      throw new Error("MCP selection cannot disable an injected coordination server");
    }
    const server = servers.get(name);
    servers.set(name, { ...(isRecord(server) ? server : {}), enabled });
  }
  config.mcp_servers = Object.fromEntries(servers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only boolean enabled flags can survive aggregate composition without losing MCP policy. */
export function readCodexMcpEnabledOverrides(args: readonly string[]): Record<string, boolean> {
  const enabled = new Map<string, boolean>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    let override: string | undefined;
    if (argument === "-c" || argument === "--config") {
      override = args[++index];
      if (override === undefined)
        throw new Error("Incomplete Codex provider configuration override");
    } else if (argument.startsWith("--config=")) {
      override = argument.slice("--config=".length);
    } else if (argument.startsWith("-c") && !argument.startsWith("--")) {
      override = argument.slice(2).replace(/^=/, "");
    }
    if (override === undefined) continue;
    const key = override.split("=", 1)[0].trim();
    if (!key.startsWith("mcp_servers")) continue;
    const flag = /^mcp_servers\.([A-Za-z0-9_-]+)\.enabled\s*=\s*(true|false)$/.exec(
      override.trim(),
    );
    if (!flag) {
      throw new Error(
        "MCP selection cannot preserve this provider MCP override; only literal per-server enabled booleans are supported",
      );
    }
    enabled.set(flag[1], flag[2] === "true");
  }
  return Object.fromEntries(enabled);
}

export function assertCodexSelectionHome(expected: string | undefined, actual: string): void {
  if (expected === undefined) return;
  let canonicalHome: string;
  try {
    canonicalHome = realpathSync.native(actual);
  } catch {
    throw new Error("Codex account routing changed or is unavailable; refresh before launching");
  }
  // Preview stores a canonical directory, never a mutable account-routing symlink.
  if (path.resolve(expected) !== canonicalHome) {
    throw new Error(
      "Codex account routing changed since the MCP selection preview; refresh before launching",
    );
  }
}
