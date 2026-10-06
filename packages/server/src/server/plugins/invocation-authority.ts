import type { PluginInvocationContext } from "@getpaseo/plugin/server";
import type { PluginRpcContract, PluginRpcWorkspacePermission } from "@getpaseo/plugin";
import type { PluginRpcInvocationScope } from "@getpaseo/protocol/messages";
import type { SessionAuthorization } from "../authorization/index.js";

// Only a resolved host context can cross runtime ingress. Never serialize this
// marker: IPC carries the verified snapshot, not a caller-supplied credential.
const issuedInvocations = new WeakSet<PluginInvocationContext>();

export function consumePluginInvocation(invocation: PluginInvocationContext | undefined): void {
  if (!invocation || !issuedInvocations.delete(invocation)) {
    throw new Error("Plugin invocation access denied");
  }
}

const workspacePermissions: readonly PluginRpcWorkspacePermission[] = [
  "workspace.read",
  "workspace.write",
  "workspace.manage",
];

/** Scope is a requested target, never proof of access. Authority comes from the
 * authenticated Session's grants, checked against canonical host records.
 * Current daemon grants are global; this does not invent per-workspace ACLs.
 */
export async function resolvePluginInvocation(
  scope: PluginRpcInvocationScope | undefined,
  dependencies: {
    authorization: Pick<SessionAuthorization, "allowsPermission">;
    authentication: PluginInvocationContext["authentication"];
    getWorkspace(id: string): Promise<{ workspaceId: string; archivedAt?: string | null } | null>;
    getAgent(id: string): Promise<{
      id: string;
      workspaceId?: string;
      archivedAt?: string | null;
    } | null>;
  },
): Promise<PluginInvocationContext | undefined> {
  if (!scope) return undefined;
  const { authorization } = dependencies;
  // Never use the plugin process's global client to establish caller grants.
  if (
    !authorization.allowsPermission("daemon.manage") ||
    !workspacePermissions.some((permission) => authorization.allowsPermission(permission))
  ) {
    throw new Error("Plugin invocation access denied");
  }
  const workspace = await dependencies.getWorkspace(scope.workspaceId);
  if (!workspace || workspace.workspaceId !== scope.workspaceId || workspace.archivedAt) {
    throw new Error("Plugin invocation access denied");
  }
  if (scope.agentId) {
    const agent = await dependencies.getAgent(scope.agentId);
    if (
      !agent ||
      agent.id !== scope.agentId ||
      agent.archivedAt ||
      agent.workspaceId !== workspace.workspaceId
    ) {
      throw new Error("Plugin invocation access denied");
    }
  }
  // Recheck grants after asynchronous resolution so revocation while resolving
  // cannot admit an invocation with stale permissions. Already admitted calls
  // retain the snapshot; this is not a durable authorization token.
  if (!authorization.allowsPermission("daemon.manage"))
    throw new Error("Plugin invocation access denied");
  const permissions = workspacePermissions.filter((permission) =>
    authorization.allowsPermission(permission),
  );
  if (!permissions.length) throw new Error("Plugin invocation access denied");
  const invocation: PluginInvocationContext = Object.freeze({
    authentication: Object.freeze({
      kind: "session" as const,
      sessionId: dependencies.authentication.sessionId,
      clientId: dependencies.authentication.clientId,
    }),
    workspaceId: workspace.workspaceId,
    ...(scope.agentId ? { agentId: scope.agentId } : {}),
    permissions: Object.freeze(permissions),
  });
  issuedInvocations.add(invocation);
  return invocation;
}

/** Enforce declared scope at the last boundary before invoking plugin code.
 * Legacy unscoped contracts retain their behavior. Payload fields grant nothing.
 */
export function assertPluginRpcAuthorization(
  contract: Pick<PluginRpcContract, "authorization">,
  invocation: PluginInvocationContext | undefined,
): void {
  const required = contract.authorization;
  if (!required) return;
  if (
    !invocation ||
    invocation.authentication?.kind !== "session" ||
    !invocation.permissions.includes(required.permission) ||
    (required.scope === "agent" && !invocation.agentId)
  ) {
    throw new Error("Plugin invocation access denied");
  }
}
