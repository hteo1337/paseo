import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { defineRpc } from "@getpaseo/plugin";
import type { PaseoApi } from "@getpaseo/client";
import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { z } from "zod";
import { PluginInstallationProvider } from "./installation-provider";
import type { InstalledPlugin } from "./types";

const status = defineRpc({
  name: "deploys.status",
  input: z.object({}),
  output: z.object({ state: z.string() }),
});
const mountedScope = { workspaceId: "workspace-a", agentId: "agent-a" };

function installation(invoked: string[]): InstalledPlugin {
  return {
    id: "deploys",
    serverId: "host",
    clientBundle: "",
    lifetime: new AbortController(),
    paseo: { dispose: async () => undefined } as PaseoApi,
    invoke: async (method) => {
      invoked.push(method);
      return { state: "green" };
    },
    queryClient: new QueryClient(),
    cleanup: () => undefined,
    settingsScreens: [],
    surfaces: [],
    sidebarItems: { header: [], footer: [] },
    legacySidebarItems: [],
    workspacePanels: [],
    commandCenterItems: [],
    clientSlashCommands: [],
    attachmentSources: [],
    themes: [],
    timelineTransformers: [],
    timelineRenderers: [],
  };
}

it("gives every surface the installation's client and RPCs on its first frame", async () => {
  const invoked: string[] = [];
  const plugin = installation(invoked);
  const received: PaseoApi[] = [];
  let rpc: ((input: Record<string, never>) => Promise<unknown>) | null = null;
  function Surface({ name }: { name: string }) {
    received.push(usePaseo());
    rpc = useRpc(status);
    return <span>{name}</span>;
  }

  const markup = ["Screen", "Sidebar item", "Popover"]
    .map((name) =>
      renderToStaticMarkup(
        <PluginInstallationProvider plugin={plugin}>
          <Surface name={name} />
        </PluginInstallationProvider>,
      ),
    )
    .join("");

  expect(markup).toBe("<span>Screen</span><span>Sidebar item</span><span>Popover</span>");
  expect(received).toEqual([plugin.paseo, plugin.paseo, plugin.paseo]);
  expect(received.every((paseo) => paseo === plugin.paseo)).toBe(true);
  await expect(rpc!({})).resolves.toEqual({ state: "green" });
  expect(invoked).toEqual(["deploys.status"]);
});

it("passes the mounted workspace and agent scope separately from the RPC payload", async () => {
  const plugin = installation([]);
  const calls: unknown[] = [];
  plugin.invoke = async (method, input, scope) => {
    calls.push({ method, input, scope });
    return { state: "green" };
  };
  let rpc: ((input: Record<string, never>) => Promise<unknown>) | null = null;
  function Surface() {
    rpc = useRpc(status);
    return null;
  }
  renderToStaticMarkup(
    <PluginInstallationProvider plugin={plugin} scope={mountedScope}>
      <Surface />
    </PluginInstallationProvider>,
  );
  await expect(rpc!({})).resolves.toEqual({ state: "green" });
  expect(calls).toEqual([
    {
      method: "deploys.status",
      input: {},
      scope: { workspaceId: "workspace-a", agentId: "agent-a" },
    },
  ]);
});
