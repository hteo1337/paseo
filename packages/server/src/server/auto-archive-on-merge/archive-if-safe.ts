import { realpathSync } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";

import type { AgentManager, ManagedAgent } from "../agent/agent-manager.js";
import type { AgentStorage } from "../agent/agent-storage.js";
import type { DaemonConfigStore } from "../daemon-config-store.js";
import {
  archiveByScope,
  type ActiveWorkspaceRef,
  killTerminalsForWorkspace,
} from "../workspace-archive-service.js";
import type {
  WorkspaceGitRuntimeSnapshot,
  WorkspaceGitServiceImpl,
} from "../workspace-git-service.js";
import type { ForgeService } from "../../services/forge-service.js";
import type { TerminalManager } from "../../terminal/terminal-manager.js";
import { isPaseoOwnedWorktreeCwd } from "../../utils/worktree.js";
import { isPathInsideRoot } from "../../utils/path.js";
import type { WorkspaceArchiveContext } from "../workspace-registry.js";

export interface AutoArchiveArchiveOptions {
  paseoHome: string;
  paseoWorktreesBaseRoot?: string;
  daemonConfigStore: DaemonConfigStore;
  workspaceGitService: WorkspaceGitServiceImpl;
  github: ForgeService;
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  terminalManager: TerminalManager;
  findWorkspaceIdForCwd: (cwd: string) => Promise<string | null>;
  listActiveWorkspaces: () => Promise<ActiveWorkspaceRef[]>;
  getAutoArchivedChangeRequestUrl: (workspaceId: string) => Promise<string | null>;
  archiveWorkspaceRecord: (workspaceId: string, context?: WorkspaceArchiveContext) => Promise<void>;
  markWorkspaceArchiving: (workspaceIds: Iterable<string>, archivingAt: string) => void;
  clearWorkspaceArchiving: (workspaceIds: Iterable<string>) => void;
  emitWorkspaceUpdatesForWorkspaceIds: (workspaceIds: Iterable<string>) => Promise<void>;
}

export interface ArchiveIfSafeDependencies {
  archiveByScope: typeof archiveByScope;
  isPaseoOwnedWorktreeCwd: typeof isPaseoOwnedWorktreeCwd;
  killTerminalsForWorkspace: typeof killTerminalsForWorkspace;
}

const defaultDependencies: ArchiveIfSafeDependencies = {
  archiveByScope,
  isPaseoOwnedWorktreeCwd,
  killTerminalsForWorkspace,
};

export type ArchiveIfSafeOutcome = "archived" | "deferred" | "skipped";

export async function archiveIfSafe(input: {
  workspaceId: string;
  snapshot: WorkspaceGitRuntimeSnapshot;
  options: AutoArchiveArchiveOptions;
  log: Logger;
  deps?: ArchiveIfSafeDependencies;
  isCancelled?: () => boolean;
}): Promise<ArchiveIfSafeOutcome> {
  const { workspaceId, snapshot, options, log } = input;
  const deps = input.deps ?? defaultDependencies;
  const cwd = snapshot.cwd;
  const pullRequest = snapshot.forge.pullRequest;

  if (!pullRequest?.isMerged) {
    return "skipped";
  }
  if (snapshot.git.isDirty === true) {
    return "skipped";
  }
  if (typeof snapshot.git.aheadOfOrigin === "number" && snapshot.git.aheadOfOrigin > 0) {
    return "skipped";
  }

  const ownership = await deps.isPaseoOwnedWorktreeCwd(cwd, {
    paseoHome: options.paseoHome,
    worktreesRoot: options.paseoWorktreesBaseRoot,
  });
  if (input.isCancelled?.()) return "skipped";
  if (!ownership.allowed) {
    return "skipped";
  }

  try {
    const autoArchivedChangeRequestUrl = await options.getAutoArchivedChangeRequestUrl(workspaceId);
    if (input.isCancelled?.()) return "skipped";
    if (autoArchivedChangeRequestUrl === pullRequest.url) {
      return "skipped";
    }

    const deletedRoot = ownership.worktreePath ?? cwd;
    const busyAgentIds = listBusyAgentIds(options.agentManager, workspaceId, deletedRoot);
    if (busyAgentIds.length > 0) {
      log.info(
        { workspaceId, cwd, agentIds: busyAgentIds },
        "Deferred auto-archive after PR merge: agent still working",
      );
      return "deferred";
    }

    const result = await deps.archiveByScope(
      {
        paseoHome: options.paseoHome,
        paseoWorktreesBaseRoot: options.paseoWorktreesBaseRoot,
        github: options.github,
        workspaceGitService: options.workspaceGitService,
        agentManager: options.agentManager,
        agentStorage: options.agentStorage,
        findWorkspaceIdForCwd: options.findWorkspaceIdForCwd,
        listActiveWorkspaces: options.listActiveWorkspaces,
        archiveWorkspaceRecord: (workspaceIdToArchive) =>
          options.archiveWorkspaceRecord(workspaceIdToArchive, {
            autoArchivedChangeRequestUrl: pullRequest.url,
          }),
        emitWorkspaceUpdatesForWorkspaceIds: options.emitWorkspaceUpdatesForWorkspaceIds,
        markWorkspaceArchiving: options.markWorkspaceArchiving,
        clearWorkspaceArchiving: options.clearWorkspaceArchiving,
        killTerminalsForWorkspace: (workspaceIdToKill) =>
          deps.killTerminalsForWorkspace(
            {
              terminalManager: options.terminalManager,
              sessionLogger: log,
            },
            workspaceIdToKill,
          ),
        sessionLogger: log,
      },
      {
        scope: { kind: "workspace", workspaceId },
        requestId: "auto-archive-on-merge",
        abortIf: () =>
          input.isCancelled?.()
            ? "cancelled"
            : listBusyAgentIds(options.agentManager, workspaceId, deletedRoot),
        holdNewRuns: () => options.agentManager.holdNewRunsForArchive(workspaceId, deletedRoot),
        keepDirectory: true,
      },
    );
    if (result.cancelled) return "skipped";
    if (result.deferredByAgentIds?.length) {
      log.info(
        { workspaceId, cwd, agentIds: result.deferredByAgentIds },
        "Deferred auto-archive after PR merge: agent still working",
      );
      return "deferred";
    }
    log.info(
      { workspaceId, cwd, branch: pullRequest.headRefName, pullRequestUrl: pullRequest.url },
      "Auto-archived workspace after PR merge",
    );
    return "archived";
  } catch (error) {
    log.warn({ err: error, cwd }, "Auto-archive after merge failed");
    return "skipped";
  }
}

export function isAgentWorking(agentManager: AgentManager, agent: ManagedAgent): boolean {
  return agent.lifecycle === "initializing" || agentManager.hasInFlightRun(agent.id);
}

// A deferral is retried by index.ts when an agent stops working. Internal agents
// never show up in listAgents(), so a busy one must be checked separately here.
function listBusyAgentIds(agentManager: AgentManager, workspaceId: string, root: string): string[] {
  const canonicalRoot = canonicalPath(root);
  return agentManager
    .listAgentsIncludingInternal()
    .filter((agent) => {
      const agentCwd = canonicalPath(agent.cwd);
      return agent.workspaceId === workspaceId || isPathInsideRoot(canonicalRoot, agentCwd);
    })
    .filter((agent) =>
      agent.workspaceId === workspaceId
        ? isAgentWorking(agentManager, agent)
        : agent.lifecycle !== "closed",
    )
    .map((agent) => agent.id);
}

// Filesystem identity: resolves symlinks (/tmp vs /private/tmp) and on-disk case.
function canonicalPath(target: string): string {
  try {
    return realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
}
