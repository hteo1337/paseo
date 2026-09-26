import { expect, test } from "vitest";
import { createPaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { PluginHookHandlers } from "./index.js";

const paseo = createPaseoApi(
  new DaemonClient({ url: "ws://127.0.0.1:1/ws", clientId: "lifecycle-unit" }),
);

test("removing an old registration twice preserves a newer registration for the same hook", async () => {
  const hooks = new PluginHookHandlers(() => {});
  const remove = hooks.before("workspace.create", ({ request }) => {
    return { ...request, title: "old" };
  });
  remove();
  hooks.before("workspace.create", ({ request }) => {
    return { ...request, title: "new" };
  });
  remove();
  const output = await hooks.invoke(
    "operation",
    "before",
    "workspace.create",
    {
      source: { kind: "directory", path: "/project" },
    },
    paseo,
  );
  expect(output).toEqual({ source: { kind: "directory", path: "/project" }, title: "new" });
});

test("before hooks compose returned requests and preserve the original input", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.before("workspace.create", ({ request }) => {
    return { ...request, title: "first" };
  });
  hooks.before("workspace.create", () => {
    return;
  });
  hooks.before("workspace.create", ({ request }) => {
    return { ...request, title: request.title + ":second" };
  });
  const input = { source: { kind: "directory", path: "/project" } };
  expect(await hooks.invoke("operation", "before", "workspace.create", input, paseo)).toEqual({
    source: { kind: "directory", path: "/project" },
    title: "first:second",
  });
  expect(input).toEqual({ source: { kind: "directory", path: "/project" } });
});

test("teardown aborts an active callback and removes its registrations", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.before("workspace.create", async (_input, context) => {
    await new Promise<void>((_resolve, reject) => {
      context.signal.addEventListener(
        "abort",
        () => {
          reject(new Error("Hook aborted"));
        },
        { once: true },
      );
    });
  });
  const invocation = hooks.invoke(
    "operation",
    "before",
    "workspace.create",
    {
      source: { kind: "directory", path: "/project" },
    },
    paseo,
  );
  hooks.close();
  await expect(invocation).rejects.toThrow("Hook aborted");
  expect(hooks.catalog()).toEqual({ events: [], before: [] });
});

test("session-open hooks reject changes to session identity instead of silently ignoring them", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.before("agent.session_open", ({ request }) => {
    return { ...request, provider: "another-provider" };
  });
  await expect(
    hooks.invoke(
      "operation",
      "before",
      "agent.session_open",
      {
        agentId: "agent",
        workspaceId: "workspace",
        provider: "claude",
        cwd: "/project",
        reason: "resume",
        purpose: "interactive",
        model: "opus",
        title: "Fix x",
        env: {},
      },
      paseo,
    ),
  ).rejects.toThrow("agent.session_open hooks can only change env");
});

test("set_model: a throw refuses and a changed result throws", async () => {
  const input = {
    agentId: "agent",
    provider: "claude",
    source: "client" as const,
    fromModel: "sonnet",
    toModel: "opus",
    title: "Fix x",
    cwd: "/project",
  };
  const refusing = new PluginHookHandlers(() => {});
  refusing.before("agent.set_model", () => {
    throw new Error("refused");
  });
  await expect(
    refusing.invoke("refuse", "before", "agent.set_model", input, paseo),
  ).rejects.toThrow("refused");
  const changing = new PluginHookHandlers(() => {});
  changing.before("agent.set_model", ({ request }) => ({ ...request, toModel: "sonnet" }));
  await expect(
    changing.invoke("change", "before", "agent.set_model", input, paseo),
  ).rejects.toThrow("agent.set_model hooks cannot change the request");
  const changingSource = new PluginHookHandlers(() => {});
  changingSource.before("agent.set_model", ({ request }) => ({ ...request, source: "provider" }));
  await expect(
    changingSource.invoke("source", "before", "agent.set_model", input, paseo),
  ).rejects.toThrow("agent.set_model hooks cannot change the request");
});

test.each(["model", "title"] as const)("session_open: changing %s throws", async (field) => {
  const hooks = new PluginHookHandlers(() => {});
  const input = {
    agentId: "agent",
    workspaceId: null,
    provider: "claude",
    cwd: "/project",
    reason: "resume" as const,
    purpose: "interactive" as const,
    model: "opus",
    title: "Fix x",
    env: {},
  };
  hooks.before("agent.session_open", ({ request }) => ({
    ...request,
    [field]: "changed",
  }));
  await expect(
    hooks.invoke("change", "before", "agent.session_open", input, paseo),
  ).rejects.toThrow("agent.session_open hooks can only change env");
});

test.each([
  "agentId",
  "provider",
  "cwd",
  "workspaceId",
  "reason",
  "purpose",
  "model",
  "requestedModel",
  "title",
] as const)("session_opened: changing %s throws", async (field) => {
  const hooks = new PluginHookHandlers(() => {});
  const input = {
    agentId: "agent",
    provider: "codex",
    cwd: "/project",
    workspaceId: null,
    reason: "create" as const,
    purpose: "interactive" as const,
    model: "sonnet",
    requestedModel: "sonnet",
    title: "Fix x",
  };
  hooks.before("agent.session_opened", ({ request }) => ({ ...request, [field]: "changed" }));
  await expect(
    hooks.invoke("change", "before", "agent.session_opened", input, paseo),
  ).rejects.toThrow();
});

test("session_open: old-shaped return applies env and preserves model/title", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.before("agent.session_open", ({ request }) => {
    const { model: _model, title: _title, ...oldRequest } = request;
    return { ...oldRequest, env: { X: "1" } };
  });
  const input = {
    agentId: "agent",
    workspaceId: null,
    provider: "claude",
    cwd: "/project",
    reason: "create" as const,
    purpose: "interactive" as const,
    model: "sonnet",
    title: "Fix x",
    env: {},
  };
  await expect(hooks.invoke("old", "before", "agent.session_open", input, paseo)).resolves.toEqual({
    ...input,
    env: { X: "1" },
  });
});
