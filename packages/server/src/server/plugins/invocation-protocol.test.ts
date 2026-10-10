import { describe, expect, it } from "vitest";
import {
  PluginProcessMessageSchema,
  PluginProcessRequestSchema,
} from "./plugin-process-protocol.js";

describe("plugin invocation IPC authority", () => {
  it("validates trusted ready requirements while retaining old unscoped handshakes", () => {
    const ready = { type: "ready", methods: ["read"], providers: [] };
    expect(PluginProcessMessageSchema.safeParse(ready).success).toBe(true);
    expect(
      PluginProcessMessageSchema.safeParse({
        ...ready,
        rpcAuthorizations: {
          read: { scope: "workspace", permission: "workspace.read" },
        },
      }).success,
    ).toBe(true);
    for (const requirement of [
      { scope: "workspace", permission: "daemon.manage" },
      { scope: "global", permission: "workspace.read" },
      { scope: "workspace", permission: "workspace.read", trusted: true },
    ]) {
      expect(
        PluginProcessMessageSchema.safeParse({
          ...ready,
          rpcAuthorizations: { read: requirement },
        }).success,
      ).toBe(false);
    }
  });

  it("accepts only bounded owner Unix evidence at trusted IPC ingress", () => {
    const origin = { kind: "owner-unix", serverId: "server", ownerUid: 501, peerUid: 501 };
    const invocation = {
      authentication: {
        kind: "session",
        sessionId: "11111111-1111-4111-8111-111111111111",
        clientId: "c",
      },
      workspaceId: "w",
      permissions: ["workspace.read"],
      origin,
    };
    const invoke = { type: "invoke", requestId: "r", method: "read", input: {}, invocation };
    expect(PluginProcessRequestSchema.safeParse(invoke).success).toBe(true);
    for (const edit of [{ peerUid: 502 }, { ownerUid: -1 }, { kind: "tcp" }, { extra: true }])
      expect(
        PluginProcessRequestSchema.safeParse({
          ...invoke,
          invocation: { ...invocation, origin: { ...origin, ...edit } },
        }).success,
      ).toBe(false);
  });
  it("rejects malformed authority envelopes instead of stripping extra claims", () => {
    const invoke = {
      type: "invoke",
      requestId: "r",
      method: "read",
      input: {},
    };
    expect(PluginProcessRequestSchema.safeParse(invoke).success).toBe(true);
    expect(
      PluginProcessRequestSchema.safeParse({
        ...invoke,
        invocation: {
          authentication: {
            kind: "session",
            sessionId: "11111111-1111-4111-8111-111111111111",
            clientId: "reported",
          },
          workspaceId: "w",
          agentId: "a",
          permissions: ["workspace.read"],
        },
      }).success,
    ).toBe(true);
    const authentication = {
      kind: "session",
      sessionId: "11111111-1111-4111-8111-111111111111",
      clientId: "reported",
    };
    for (const invocation of [
      { workspaceId: "w", permissions: ["workspace.read"] },
      {
        authentication: { ...authentication, kind: "principal" },
        workspaceId: "w",
        permissions: ["workspace.read"],
      },
      {
        authentication: {
          ...authentication,
          sessionId: "reported-not-session",
        },
        workspaceId: "w",
        permissions: ["workspace.read"],
      },
      {
        authentication: { ...authentication, principalId: "forged" },
        workspaceId: "w",
        permissions: ["workspace.read"],
      },
      { workspaceId: "", permissions: ["workspace.read"] },
      { workspaceId: "w", permissions: ["daemon.manage"] },
      { workspaceId: "w", permissions: ["workspace.read"], owner: true },
    ]) {
      expect(PluginProcessRequestSchema.safeParse({ ...invoke, invocation }).success).toBe(false);
    }
  });
});
