import { resolve } from "node:path";
import { LRUCache } from "lru-cache";
import type { Logger } from "pino";

import { archiveIfSafe, type AutoArchiveArchiveOptions } from "./archive-if-safe.js";
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
  const retryTimersByCwd = new Map<string, ReturnType<typeof setTimeout>>();
  const retryAttemptsByCwd = new Map<string, number>();
  let disposed = false;

  const clearDeferral = (cwd: string): void => {
    deferredSnapshotsByCwd.delete(cwd);
    retryAttemptsByCwd.delete(cwd);
    const timer = retryTimersByCwd.get(cwd);
    if (timer) clearTimeout(timer);
    retryTimersByCwd.delete(cwd);
  };

  const scheduleRetry = (cwd: string): void => {
    if (disposed || !deferredSnapshotsByCwd.has(cwd) || retryTimersByCwd.has(cwd)) return;
    const attempt = retryAttemptsByCwd.get(cwd) ?? 0;
    if (attempt >= 5) return;
    const timer = setTimeout(
      () => {
        retryTimersByCwd.delete(cwd);
        const deferred = deferredSnapshotsByCwd.get(cwd);
        if (deferred) handleSnapshot(deferred, true);
      },
      attempt === 0 ? 5_000 : 30_000,
    );
    timer.unref();
    retryTimersByCwd.set(cwd, timer);
    retryAttemptsByCwd.set(cwd, attempt + 1);
  };

  const handleSnapshot = (snapshot: WorkspaceGitRuntimeSnapshot, isRetry = false): void => {
    if (disposed) return;
    const snapshotCwd = deps.resolvePath(snapshot.cwd);
    if (options.daemonConfigStore.get().autoArchiveAfterMerge !== true) {
      openPullRequestUrlsByCwd.delete(snapshotCwd);
      clearDeferral(snapshotCwd);
      return;
    }

    const pullRequest = snapshot.forge.pullRequest;
    if (!pullRequest?.isMerged) {
      if (pullRequest?.state.toLowerCase() === "open") {
        openPullRequestUrlsByCwd.set(snapshotCwd, pullRequest.url);
      } else {
        openPullRequestUrlsByCwd.delete(snapshotCwd);
      }
      clearDeferral(snapshotCwd);
      return;
    }
    if (openPullRequestUrlsByCwd.get(snapshotCwd) !== pullRequest.url) {
      openPullRequestUrlsByCwd.delete(snapshotCwd);
      clearDeferral(snapshotCwd);
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
      if (disposed) return;
      const freshPullRequest = freshSnapshot?.forge.pullRequest;
      if (
        !freshPullRequest?.isMerged ||
        freshPullRequest.url !== pullRequest.url ||
        openPullRequestUrlsByCwd.get(snapshotCwd) !== pullRequest.url
      ) {
        if (openPullRequestUrlsByCwd.get(snapshotCwd) === pullRequest.url) {
          openPullRequestUrlsByCwd.delete(snapshotCwd);
        }
        clearDeferral(snapshotCwd);
        return;
      }

      const attachedWorkspaces = (await options.listActiveWorkspaces()).filter(
        (workspace) => deps.resolvePath(workspace.cwd) === snapshotCwd,
      );
      if (disposed) return;
      let deferred = false;
      for (const workspace of attachedWorkspaces) {
        if (disposed) return;
        const outcome = await deps.archiveIfSafe({
          workspaceId: workspace.workspaceId,
          snapshot: freshSnapshot,
          options,
          log,
          isCancelled: () => disposed,
        });
        if (outcome === "deferred") {
          deferred = true;
          deferredSnapshotsByCwd.set(snapshotCwd, freshSnapshot);
        }
      }
      if (!deferred) clearDeferral(snapshotCwd);
    })()
      .catch((error) => {
        log.warn({ err: error, cwd: snapshot.cwd }, "Failed to auto-archive attached workspaces");
      })
      .finally(() => {
        inFlightCwds.delete(snapshotCwd);
        const deferred = deferredSnapshotsByCwd.get(snapshotCwd);
        if (retryAfterFlightCwds.delete(snapshotCwd) && deferred && !disposed) {
          setImmediate(() => handleSnapshot(deferred, true));
        } else {
          scheduleRetry(snapshotCwd);
        }
      });
  };

  const snapshotSubscription = options.workspaceGitService.onSnapshotUpdated((snapshot) =>
    handleSnapshot(snapshot),
  );
  const unsubscribeAgents = options.agentManager.subscribe(
    (event) => {
      if (
        event.type !== "agent_state" ||
        event.agent.lifecycle === "running" ||
        event.agent.lifecycle === "initializing"
      ) {
        return;
      }
      setImmediate(() => {
        if (disposed) return;
        for (const cwd of inFlightCwds) retryAfterFlightCwds.add(cwd);
        for (const [cwd, snapshot] of Array.from(deferredSnapshotsByCwd.entries())) {
          retryAttemptsByCwd.delete(cwd);
          handleSnapshot(snapshot, true);
        }
      });
    },
    // An archive deferred by a busy internal agent must resume when that agent goes
    // idle; internal agents are otherwise invisible to global subscribers.
    { replayState: false, includeInternalAgentEvents: true },
  );

  return {
    unsubscribe: () => {
      disposed = true;
      for (const timer of retryTimersByCwd.values()) clearTimeout(timer);
      retryTimersByCwd.clear();
      snapshotSubscription.unsubscribe();
      unsubscribeAgents();
    },
  };
}
