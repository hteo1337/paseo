import { describe, expect, it } from "vitest";
import { PluginRpcInvokeRequestSchema } from "./messages";

describe("plugin RPC requested scope", () => {
  it("keeps legacy input separate and rejects malformed or self-granted scope", () => {
    const request = {
      type: "plugin.rpc.invoke.request",
      requestId: "r",
      pluginId: "p",
      method: "status",
      input: { workspace: "forged" },
    };
    expect(PluginRpcInvokeRequestSchema.parse(request)).not.toHaveProperty("scope");
    expect(
      PluginRpcInvokeRequestSchema.parse({ ...request, scope: { workspaceId: "w", agentId: "a" } })
        .scope,
    ).toEqual({ workspaceId: "w", agentId: "a" });
    for (const scope of [
      {},
      { workspaceId: "" },
      { workspaceId: "w", agentId: "" },
      { workspaceId: "w", permissions: ["workspace.manage"] },
    ]) {
      expect(PluginRpcInvokeRequestSchema.safeParse({ ...request, scope }).success).toBe(false);
    }
  });
});
