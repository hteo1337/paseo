import { expect, test } from "vitest";
import { createPaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { validateBeforeResult, PluginHookHandlers } from "./index.js";

const paseo = createPaseoApi(
  new DaemonClient({ url: "ws://127.0.0.1:1/ws", clientId: "lifecycle-unit" }),
);

test("agent.create provenance survives an old plugin return and cannot be changed", async () => {
  const hooks = new PluginHookHandlers(() => {});
  const creation = {
    source: "cli" as const,
    callerAgentId: null,
    labels: { dispatch_task_id: "task" },
  };
  const input = { config: { provider: "codex", cwd: "/project" }, creation };
  hooks.before("agent.create", ({ request }) => ({
    config: { ...request.config, title: "modified" },
  }));
  expect(await hooks.invoke("operation", "agent.create.before", input, paseo)).toEqual({
    ...input,
    config: { ...input.config, title: "modified" },
  });
  for (const change of [
    { ...creation, source: "system" as const },
    { ...creation, callerAgentId: "different" },
    { ...creation, labels: { direct: "operator" } },
  ]) {
    const mutating = new PluginHookHandlers(() => {});
    mutating.before("agent.create", ({ request }) => ({ ...request, creation: change }));
    await expect(mutating.invoke("operation", "agent.create.before", input, paseo)).rejects.toThrow(
      "cannot change creation provenance",
    );
  }
});

test("removing an old registration twice preserves a newer registration for the same hook", async () => {
  const hooks = new PluginHookHandlers(() => {});
  const remove = hooks.addHook("workspace.create.before", async ({ request }) => {
    return { ...request, title: "old" };
  });
  remove();
  hooks.addHook("workspace.create.before", async ({ request }) => {
    return { ...request, title: "new" };
  });
  remove();
  const output = await hooks.invoke(
    "operation",
    "workspace.create.before",
    {
      source: { kind: "directory", path: "/project" },
    },
    paseo,
  );
  expect(output).toEqual({ source: { kind: "directory", path: "/project" }, title: "new" });
});

test("before hooks compose returned requests and preserve the original input", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.addHook("workspace.create.before", async ({ request }) => {
    return { ...request, title: "first" };
  });
  hooks.addHook("workspace.create.before", async () => {
    return;
  });
  hooks.addHook("workspace.create.before", async ({ request }) => {
    return { ...request, title: request.title + ":second" };
  });
  const input = { source: { kind: "directory", path: "/project" } };
  expect(await hooks.invoke("operation", "workspace.create.before", input, paseo)).toEqual({
    source: { kind: "directory", path: "/project" },
    title: "first:second",
  });
  expect(input).toEqual({ source: { kind: "directory", path: "/project" } });
});

test("teardown aborts an active callback and removes its registrations", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.addHook("workspace.create.before", async (_input, context) => {
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
    "workspace.create.before",
    {
      source: { kind: "directory", path: "/project" },
    },
    paseo,
  );
  hooks.close();
  await expect(invocation).rejects.toThrow("Hook aborted");
  expect(hooks.catalog()).toEqual([]);
});

test("session-open hooks reject changes to session identity instead of silently ignoring them", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.addHook("agent.open.before", async ({ request }) => {
    return { ...request, provider: "another-provider" };
  });
  await expect(
    hooks.invoke(
      "operation",
      "agent.open.before",
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
        labels: {},
        tools: [],
        mcpServers: {},
      },
      paseo,
    ),
  ).rejects.toThrow("agent.open.before hooks can only change env");
});

test.each([{ title: "Changed" }, { labels: { changed: "true" } }])(
  "session-open targeting metadata is read-only: %j",
  async (patch) => {
    const hooks = new PluginHookHandlers(() => {});
    hooks.addHook("agent.open.before", async ({ request }) => ({ ...request, ...patch }));
    await expect(
      hooks.invoke(
        "operation",
        "agent.open.before",
        {
          agentId: "agent",
          workspaceId: null,
          provider: "codex",
          cwd: "/project",
          model: "sonnet",
          title: "Original",
          labels: {},
          tools: [],
          mcpServers: {},
          env: {},
          reason: "create",
          purpose: "interactive",
        },
        paseo,
      ),
    ).rejects.toThrow("agent.open.before hooks can only change env, tools, and mcpServers");
  },
);

test("new request-changing registrations compose with legacy registrations in registration order", async () => {
  const hooks = new PluginHookHandlers(() => {});
  hooks.before("workspace.create", ({ request }) => ({ ...request, title: "legacy" }));
  hooks.addHook("workspace.create.before", async ({ request }) => ({
    ...request,
    title: request.title + ":new",
  }));
  hooks.before("workspace.create", ({ request }) => ({
    ...request,
    title: request.title + ":last",
  }));
  expect(
    await hooks.invoke(
      "operation",
      "workspace.create.before",
      {
        source: { kind: "directory", path: "/project" },
      },
      paseo,
    ),
  ).toEqual({ source: { kind: "directory", path: "/project" }, title: "legacy:new:last" });
});

test.each(["agent.session_open", "agent.create.prepare", "nonsense"])(
  "addHook rejects unsupported name %s at registration",
  (name) => {
    const hooks = new PluginHookHandlers(() => {});
    // @ts-expect-error Runtime validation also protects untyped plugins.
    expect(() => hooks.addHook(name, async () => {})).toThrow(name);
  },
);

test.each([
  ["workspace.create", "workspace.create.before"],
  ["workspace.created", "workspace.create.after"],
  ["workspace.archived", "workspace.archive.after"],
  ["agent.create", "agent.create.before"],
  ["agent.created", "agent.create.after"],
  ["agent.session_open", "agent.open.before"],
  ["agent.closed", "agent.close.after"],
  ["agent.archived", "agent.archive.after"],
  ["agent.turn_started", "agent.turn.before"],
  ["agent.turn_ended", "agent.turn.after"],
  ["agent.permission_requested", "agent.permission.before"],
  ["agent.permission_resolved", "agent.permission.after"],
] as const)("legacy %s registers only %s across the process boundary", (oldName, newName) => {
  const hooks = new PluginHookHandlers(() => {});
  const handler = async () => {};
  const remove =
    oldName === "workspace.create" || oldName === "agent.create" || oldName === "agent.session_open"
      ? hooks.before(oldName, handler)
      : hooks.on(oldName, handler);
  hooks.addHook(newName, async () => {});
  expect(hooks.catalog()).toEqual([newName]);
  remove();
  expect(hooks.catalog()).toEqual([newName]);
  hooks.close();
  expect(hooks.catalog()).toEqual([]);
});

test("legacy notifications and addHook share payloads, registration order, and cleanup", async () => {
  const hooks = new PluginHookHandlers(() => {});
  const received: unknown[] = [];
  const remove = hooks.on("workspace.created", (event) => {
    received.push(["old", event]);
  });
  hooks.addHook("workspace.create.after", async (event) => {
    received.push(["new", event]);
  });
  const payload = {
    workspace: {
      id: "workspace",
      projectId: "project",
      cwd: "/project",
      name: null,
      archivedAt: null,
    },
  };
  await hooks.invoke("first", "workspace.create.after", payload, paseo);
  remove();
  remove();
  await hooks.invoke("second", "workspace.create.after", payload, paseo);
  expect(received).toEqual([
    ["old", payload],
    ["new", payload],
    ["new", payload],
  ]);
});

test("a waiting after hook propagates failures and stops later handlers", async () => {
  const hooks = new PluginHookHandlers(() => {});
  const received: string[] = [];
  hooks.addHook("worktree.create.after", async ({ worktree }) => {
    received.push(worktree.path);
    throw new Error("cannot initialize worktree");
  });
  hooks.addHook("worktree.create.after", async () => {
    received.push("unexpected later handler");
  });
  await expect(
    hooks.invoke(
      "worktree",
      "worktree.create.after",
      {
        worktree: { path: "/worktree", branch: "feature", sourceCheckout: "/source" },
      },
      paseo,
    ),
  ).rejects.toThrow("cannot initialize worktree");
  expect(received).toEqual(["/worktree"]);
});

test("checkout-branch hooks reject a branch-off baseRef", async () => {
  const request = {
    kind: "checkout-branch" as const,
    repoRoot: "/repo",
    sourceCheckout: "/repo",
    branch: "feature",
    slug: "feature",
    path: "/work/feature",
  };
  await expect(
    validateBeforeResult("worktree.create.before", request, { ...request, baseRef: "main" }),
  ).rejects.toThrow(/baseRef/);
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
  await expect(refusing.invoke("refuse", "agent.set_model", input, paseo)).rejects.toThrow(
    "refused",
  );
  const changing = new PluginHookHandlers(() => {});
  changing.before("agent.set_model", ({ request }) => ({ ...request, toModel: "sonnet" }));
  await expect(changing.invoke("change", "agent.set_model", input, paseo)).rejects.toThrow(
    "agent.set_model hooks cannot change the request",
  );
  const changingSource = new PluginHookHandlers(() => {});
  changingSource.before("agent.set_model", ({ request }) => ({ ...request, source: "provider" }));
  await expect(changingSource.invoke("source", "agent.set_model", input, paseo)).rejects.toThrow(
    "agent.set_model hooks cannot change the request",
  );
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
    labels: {},
    tools: [],
    mcpServers: {},
    env: {},
  };
  hooks.before("agent.session_open", ({ request }) => ({
    ...request,
    [field]: "changed",
  }));
  await expect(hooks.invoke("change", "agent.open.before", input, paseo)).rejects.toThrow(
    "agent.open.before hooks can only change env",
  );
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
  await expect(hooks.invoke("change", "agent.session_opened", input, paseo)).rejects.toThrow();
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
    labels: {},
    tools: [],
    mcpServers: {},
    env: {},
  };
  await expect(hooks.invoke("old", "agent.open.before", input, paseo)).resolves.toEqual({
    ...input,
    env: { X: "1" },
  });
});

test("turn_start accepts every source, refuses throws, and rejects changed or extra fields", async () => {
  const input = {
    agentId: "agent",
    provider: "claude",
    model: "opus",
    requestedModel: "opus",
    title: "Fix x",
    cwd: "/project",
    workspaceId: null,
    source: "prompt" as const,
    env: { ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-opus-4-1" },
  };
  for (const source of [
    "prompt",
    "schedule",
    "heartbeat",
    "internal",
    "other",
    "autonomous",
  ] as const) {
    const hooks = new PluginHookHandlers(() => {});
    hooks.before("agent.turn_start", ({ request }) => request);
    await expect(
      hooks.invoke(source, "agent.turn_start", { ...input, source }, paseo),
    ).resolves.toEqual({ ...input, source });
  }
  const refusing = new PluginHookHandlers(() => {});
  refusing.before("agent.turn_start", () => {
    throw new Error("opus refused");
  });
  await expect(refusing.invoke("refuse", "agent.turn_start", input, paseo)).rejects.toThrow(
    "opus refused",
  );
  const changing = new PluginHookHandlers(() => {});
  changing.before("agent.turn_start", ({ request }) => ({ ...request, model: "sonnet" }));
  await expect(changing.invoke("change", "agent.turn_start", input, paseo)).rejects.toThrow(
    "agent.turn_start hooks cannot change the request",
  );
  const changingEnv = new PluginHookHandlers(() => {});
  changingEnv.before("agent.turn_start", ({ request }) => ({ ...request, env: null }));
  await expect(changingEnv.invoke("change-env", "agent.turn_start", input, paseo)).rejects.toThrow(
    "agent.turn_start hooks cannot change the request",
  );
  await expect(
    changing.invoke("extra", "agent.turn_start", { ...input, extra: true }, paseo),
  ).rejects.toThrow();
  const adding = new PluginHookHandlers(() => {});
  adding.before("agent.turn_start", ({ request }) => ({ ...request, extra: true }));
  await expect(adding.invoke("output-extra", "agent.turn_start", input, paseo)).rejects.toThrow();
  await expect(
    adding.invoke("missing-env", "agent.turn_start", { ...input, env: undefined }, paseo),
  ).rejects.toThrow();
});
