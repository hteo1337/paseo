import type { PluginRpcInvocationScope } from "@getpaseo/protocol/messages";
import { useEffect, useState } from "react";
import type { InstalledPlugin } from "./types";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export interface PluginSurfaceRuntime {
  paseo: PaseoApi;
  invoke(method: string, input: unknown): Promise<unknown>;
}

export function createPluginSurfaceRuntime(
  client: DaemonClient | null,
  plugin: Pick<InstalledPlugin, "id" | "lifetime">,
  scope?: PluginRpcInvocationScope,
): PluginSurfaceRuntime | null {
  if (!client || plugin.lifetime.signal.aborted) return null;
  const invocationScope = scope ? { ...scope } : undefined;
  return {
    paseo: createPaseoApi(client, { signal: plugin.lifetime.signal }),
    invoke: (method, input) =>
      invocationScope
        ? client.invokePluginRpc(plugin.id, method, input, invocationScope)
        : client.invokePluginRpc(plugin.id, method, input),
  };
}

/** A mounted surface owns its API; creating a React element creates no server demand. */
export function usePluginSurfaceRuntime(
  client: DaemonClient | null,
  plugin: InstalledPlugin | null | undefined,
  scope?: PluginRpcInvocationScope,
): PluginSurfaceRuntime | null {
  const workspaceId = scope?.workspaceId;
  const agentId = scope?.agentId;
  const [mounted, setMounted] = useState<{
    client: DaemonClient;
    plugin: InstalledPlugin;
    runtime: PluginSurfaceRuntime;
    workspaceId: string | undefined;
    agentId: string | undefined;
  } | null>(null);
  useEffect(() => {
    if (!client || !plugin) return;
    const runtime = createPluginSurfaceRuntime(
      client,
      plugin,
      workspaceId ? { workspaceId, ...(agentId ? { agentId } : {}) } : undefined,
    );
    if (!runtime) return;
    setMounted({ client, plugin, runtime, workspaceId, agentId });
    return () => {
      void runtime.paseo
        .dispose()
        .catch((error) => console.warn(`[Plugins] Surface cleanup failed for ${plugin.id}`, error));
    };
  }, [client, plugin, workspaceId, agentId]);
  return mounted?.client === client &&
    mounted.plugin === plugin &&
    mounted.workspaceId === workspaceId &&
    mounted.agentId === agentId
    ? mounted.runtime
    : null;
}
