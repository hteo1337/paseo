import { resolve } from "node:path";
import { LRUCache } from "lru-cache";
import type { Logger } from "pino";

import {
  archiveIfSafe,
  isAgentWorking,
  type AutoArchiveArchiveOptions,
} from "./archive-if-safe.js";
import type {
  WorkspaceGitRuntimeSnapshot,
  WorkspaceGitSubscription,
} from "../workspace-git-service.js";

export interface AutoArchiveOnMergeOptions extends AutoArchiveArchiveOptions {
  logger: Logger;
}

export interface AutoArchiveOnMergeDependencies {
  archiveIfSafe: typeof archiveIfSafe;
  resolvePath: typeof resolve;
}

const OPEN_PULL_REQUEST_LATCH_MAX = 1_024;

const defaultDependencies: AutoArchiveOnMergeDependencies = {
  archiveIfSafe,
  resolvePath: resolve,
};

export function setupAutoArchiveOnMerge(
  options: AutoArchiveOnMergeOptions,
  deps: AutoArchiveOnMergeDependencies = defaultDependencies,
): WorkspaceGitSubscription {
  const log = options.logger.child({ module: "auto-archive-on-merge" });
  const inFlightCwds = new Set<string>();
  const openPullRequestUrlsByCwd = new LRUCache<string, string>({
    max: OPEN_PULL_REQUEST_LATCH_MAX,
  });
  // Merged snapshots whose archive waited on a working agent; git emits nothing when it stops.
  const deferredSnapshotsByCwd = new Map<string, WorkspaceGitRuntimeSnapshot>();
  const retryAfterFlightCwds = new Set<string>();

  const handleSnapshot = (snapshot: WorkspaceGitRuntimeSnapshot, isRetry = false): void => {
    const snapshotCwd = deps.resolvePath(snapshot.cwd);
    if (!inFlightCwds.has(snapshotCwd)) {
      deferredSnapshotsByCwd.delete(snapshotCwd);
    }
    if (options.daemonConfigStore.get().autoArchiveAfterMerge !== true) {
      openPullRequestUrlsByCwd.delete(snapshotCwd);
      return;
    }

    const pullRequest = snapshot.forge.pullRequest;
    if (!pullRequest?.isMerged) {
      if (pullRequest?.state.toLowerCase() === "open") {
        openPullRequestUrlsByCwd.set(snapshotCwd, pullRequest.url);
      } else {
        openPullRequestUrlsByCwd.delete(snapshotCwd);
      }
      return;
    }
    if (openPullRequestUrlsByCwd.get(snapshotCwd) !== pullRequest.url) {
      openPullRequestUrlsByCwd.delete(snapshotCwd);
      return;
    }
    if (inFlightCwds.has(snapshotCwd)) {
      if (isRetry) retryAfterFlightCwds.add(snapshotCwd);
      return;
    }
    inFlightCwds.add(snapshotCwd);

    void (async () => {
      let freshSnapshot: WorkspaceGitRuntimeSnapshot | null;
      try {
        freshSnapshot = await options.workspaceGitService.getSnapshot(snapshot.cwd, {
          reason: "auto-archive-on-merge",
        });
      } catch (error) {
        log.warn(
          { err: error, cwd: snapshot.cwd },
          "Failed to read snapshot for auto-archive; skipping",
        );
        return;
      }
      const freshPullRequest = freshSnapshot?.forge.pullRequest;
      if (
        !freshPullRequest?.isMerged ||
        freshPullRequest.url !== pullRequest.url ||
        openPullRequestUrlsByCwd.get(snapshotCwd) !== pullRequest.url
      ) {
        if (openPullRequestUrlsByCwd.get(snapshotCwd) === pullRequest.url) {
          openPullRequestUrlsByCwd.delete(snapshotCwd);
        }
        return;
      }

      const attachedWorkspaces = (await options.listActiveWorkspaces()).filter(
        (workspace) => deps.resolvePath(workspace.cwd) === snapshotCwd,
      );
      for (const workspace of attachedWorkspaces) {
        const outcome = await deps.archiveIfSafe({
          workspaceId: workspace.workspaceId,
          snapshot: freshSnapshot,
          options,
          log,
        });
        if (outcome === "deferred") {
          deferredSnapshotsByCwd.set(snapshotCwd, freshSnapshot);
        }
      }
    })()
      .catch((error) => {
        log.warn({ err: error, cwd: snapshot.cwd }, "Failed to auto-archive attached workspaces");
      })
      .finally(() => {
        inFlightCwds.delete(snapshotCwd);
        const deferred = deferredSnapshotsByCwd.get(snapshotCwd);
        if (retryAfterFlightCwds.delete(snapshotCwd) && deferred) {
          handleSnapshot(deferred, true);
        }
      });
  };

  const snapshotSubscription = options.workspaceGitService.onSnapshotUpdated((snapshot) =>
    handleSnapshot(snapshot),
  );
  const unsubscribeAgents = options.agentManager.subscribe(
    (event) => {
      if (event.type !== "agent_state" || isAgentWorking(options.agentManager, event.agent)) {
        return;
      }
      // A flight may still be about to defer; have it re-run once it ends.
      for (const cwd of inFlightCwds) {
        retryAfterFlightCwds.add(cwd);
      }
      for (const snapshot of [...deferredSnapshotsByCwd.values()]) {
        handleSnapshot(snapshot, true);
      }
    },
    { replayState: false },
  );

  return {
    unsubscribe: () => {
      snapshotSubscription.unsubscribe();
      unsubscribeAgents();
    },
  };
}
