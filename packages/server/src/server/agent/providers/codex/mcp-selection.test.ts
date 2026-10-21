import { describe, expect, test } from "vitest";
import { applyCodexMcpSelection, readCodexMcpEnabledOverrides } from "./mcp-selection.js";

describe("Codex MCP session selection", () => {
  test("overlays inherited states and blocks omitted injections without weakening policy", () => {
    const config: Record<string, unknown> = {
      approval_policy: "on-request",
      sandbox_mode: "workspace-write",
      mcp_servers: {
        selected: { command: "fixture", tools: { run: { approval_mode: "prompt" } } },
        extra: { url: "http://fixture.invalid" },
        paseo: { url: "http://coordination.invalid" },
      },
    };
    applyCodexMcpSelection(config, {
      mcpServers: {
        selected: { type: "stdio", command: "fixture" },
        extra: { type: "http", url: "http://fixture.invalid" },
        paseo: { type: "http", url: "http://coordination.invalid" },
      },
      mcpServerEnabled: { selected: true, inherited: false, memory: false },
    });
    expect(config).toEqual({
      approval_policy: "on-request",
      sandbox_mode: "workspace-write",
      mcp_servers: {
        selected: {
          command: "fixture",
          tools: { run: { approval_mode: "prompt" } },
          enabled: true,
        },
        extra: { url: "http://fixture.invalid", enabled: false },
        paseo: { url: "http://coordination.invalid" },
        inherited: { enabled: false },
        memory: { enabled: false },
      },
    });
  });
  test("rejects disabling injected coordination before launch", () => {
    expect(() =>
      applyCodexMcpSelection(
        {},
        {
          mcpServers: { paseo: { type: "http", url: "http://coordination.invalid" } },
          mcpServerEnabled: { paseo: false },
        },
      ),
    ).toThrow("cannot disable an injected coordination");
  });
  test("keeps special names literal and prevents dotted-key order ambiguity", () => {
    const config = {};
    applyCodexMcpSelection(config, {
      mcpServerEnabled: JSON.parse('{"name.with.dots":false,"__proto__":false}'),
    });
    expect(config).toEqual({
      mcp_servers: JSON.parse('{"name.with.dots":{"enabled":false},"__proto__":{"enabled":false}}'),
    });
    expect(() =>
      applyCodexMcpSelection({ "mcp_servers.x.enabled": true }, { mcpServerEnabled: { x: false } }),
    ).toThrow("dotted MCP overrides");
    expect({}).not.toHaveProperty("enabled");
  });
  test("leaves ordinary launches unchanged and keeps concurrent selections isolated", () => {
    const original = { mcp_servers: { fixture: { command: "fixture" } } };
    const first = structuredClone(original),
      second = structuredClone(original);
    applyCodexMcpSelection(first, { mcpServerEnabled: { fixture: false } });
    applyCodexMcpSelection(second, {});
    expect(first.mcp_servers.fixture).toEqual({ command: "fixture", enabled: false });
    expect(second).toEqual(original);
  });
});

test("preserves literal provider flags across supported CLI spellings", () => {
  expect(
    readCodexMcpEnabledOverrides([
      "-c",
      "mcp_servers.one.enabled=false",
      "--config=mcp_servers.two.enabled=true",
      "-cmcp_servers.three.enabled=false",
      "-c=mcp_servers.one.enabled=true",
      "--config",
      "sandbox_mode=read-only",
    ]),
  ).toEqual({ one: true, two: true, three: false });
});
test.each([
  "mcp_servers={}",
  "mcp_servers.one.disabled_tools=[]",
  "mcp_servers.one.command=fixture",
  "mcp_servers.one.enabled='false'",
  "mcp_servers.one.tools.run.approval_mode=prompt",
])("refuses provider MCP policy override %s", (override) => {
  expect(() => readCodexMcpEnabledOverrides(["-c", override])).toThrow(
    "cannot preserve this provider MCP override",
  );
});
