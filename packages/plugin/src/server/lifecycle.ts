import type {
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentTimelineItem,
  AgentSessionConfig,
} from "@getpaseo/protocol/agent-types";
import type { PaseoApi } from "@getpaseo/client";
import type { WorkspaceCreateRequest } from "@getpaseo/protocol/messages";

export interface PluginHookContext {
  paseo: PaseoApi;
  signal: AbortSignal;
}

export interface PluginHookWorkspace {
  id: string;
  projectId: string;
  cwd: string;
  name: string | null;
  archivedAt: string | null;
}

export interface PluginHookAgent {
  id: string;
  workspaceId: string | null;
  parentAgentId: string | null;
  provider: string;
  cwd: string;
  title: string | null;
}

export interface PluginSessionOpenRequest {
  agentId: string;
  workspaceId: string | null;
  provider: string;
  cwd: string;
  reason: "create" | "resume" | "refresh" | "import";
  purpose: "interactive" | "history";
  model: string | null;
  title: string | null;
  env: Record<string, string>;
}

export type PluginSessionOpenedRequest = Omit<PluginSessionOpenRequest, "env"> & {
  requestedModel: string | null;
};

export interface PluginSetModelRequest {
  agentId: string;
  provider: string;
  source: "client" | "provider";
  fromModel: string | null;
  toModel: string | null;
  title: string | null;
  cwd: string;
}

export type PluginTurnOutcome =
  | { kind: "completed" }
  | { kind: "failed"; error: { message: string; code?: string } }
  | { kind: "canceled"; reason: string };

export interface PluginLifecycleEvents {
  "agent.turn_started": { agent: PluginHookAgent; turnId: string | null };
  "agent.turn_ended": {
    agent: PluginHookAgent;
    turnId: string | null;
    outcome: PluginTurnOutcome;
    timeline: readonly AgentTimelineItem[];
  };
  "agent.permission_requested": { agent: PluginHookAgent; request: AgentPermissionRequest };
  "agent.permission_resolved": {
    agent: PluginHookAgent;
    requestId: string;
    resolution: AgentPermissionResponse;
  };
  "agent.archived": { agent: PluginHookAgent; archivedAt: string };
  "agent.created": { agent: PluginHookAgent };
  "workspace.created": { workspace: PluginHookWorkspace };
  "workspace.archived": { workspace: PluginHookWorkspace };
}

export interface PluginBeforeRequests {
  "agent.create": { config: AgentSessionConfig; env?: Record<string, string> };
  "agent.set_model": PluginSetModelRequest;
  "agent.session_open": PluginSessionOpenRequest;
  "agent.session_opened": PluginSessionOpenedRequest;
  "workspace.create": Omit<WorkspaceCreateRequest, "type" | "requestId">;
}

export type PluginBeforeResult<Name extends keyof PluginBeforeRequests> =
  Name extends "agent.session_open"
    ? Omit<PluginSessionOpenRequest, "model" | "title"> &
        Partial<Pick<PluginSessionOpenRequest, "model" | "title">>
    : PluginBeforeRequests[Name];

export interface PluginLifecycleRegistration {
  on<Name extends keyof PluginLifecycleEvents>(
    name: Name,
    handler: (
      event: PluginLifecycleEvents[Name],
      context: PluginHookContext,
    ) => void | Promise<void>,
  ): () => void;
  before<Name extends keyof PluginBeforeRequests>(
    name: Name,
    handler: (
      input: { request: PluginBeforeRequests[Name] },
      context: PluginHookContext,
    ) => PluginBeforeResult<Name> | void | Promise<PluginBeforeResult<Name> | void>,
  ): () => void;
}
