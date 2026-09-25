import { resolve } from "node:path";
import type { Logger } from "pino";
import { expect, test, vi } from "vitest";

import type { ArchiveIfSafeOutcome } from "./archive-if-safe.js";
import {
  setupAutoArchiveOnMerge,
  type AutoArchiveOnMergeDependencies,
  type AutoArchiveOnMergeOptions,
} from "./index.js";
import type { AgentManagerEvent, ManagedAgent } from "../agent/agent-manager.js";
import type { WorkspaceGitRuntimeSnapshot } from "../workspace-git-service.js";

const CWD = "/repo/worktree";

function createSnapshot(state: "open" | "merged"): WorkspaceGitRuntimeSnapshot {
  return {
    cwd: CWD,
    git: {
      isGit: true,
      repoRoot: CWD,
      mainRepoRoot: "/repo",
      currentBranch: "feature",
      remoteUrl: "https://github.com/acme/repo.git",
      isPaseoOwnedWorktree: true,
      isDirty: false,
      baseRef: "main",
      aheadBehind: { ahead: 0, behind: 0 },
      aheadOfOrigin: 0,
      behindOfOrigin: 0,
      hasRemote: true,
      upstreamRef: "origin/feature",
      diffStat: { additions: 0, deletions: 0 },
    },
    forge: {
      featuresEnabled: true,
      authState: "authenticated",
      pullRequest: {
        url: "https://github.com/acme/repo/pull/12",
        title: "Feature",
        state,
        baseRefName: "main",
        headRefName: "feature",
        isMerged: state === "merged",
      },
      error: null,
    },
  };
}

function agentState(lifecycle: ManagedAgent["lifecycle"]): AgentManagerEvent {
  return { type: "agent_state", agent: { id: "agent-1", cwd: CWD, lifecycle } as ManagedAgent };
}

function createJourney(outcomes: Array<() => Promise<ArchiveIfSafeOutcome>>) {
  let onSnapshotUpdated: ((snapshot: WorkspaceGitRuntimeSnapshot) => void) | null = null;
  let onAgentEvent: ((event: AgentManagerEvent) => void) | null = null;
  let lastLifecycle: ManagedAgent["lifecycle"] = "idle";
  const getSnapshot = vi.fn(async () => createSnapshot("merged"));
  const options = {
    logger: { child: () => ({ warn: vi.fn(), info: vi.fn() }) } as unknown as Logger,
    daemonConfigStore: { get: () => ({ autoArchiveAfterMerge: true }) },
    agentManager: {
      subscribe: (callback: (event: AgentManagerEvent) => void) => {
        onAgentEvent = (event) => {
          if (event.type === "agent_state") lastLifecycle = event.agent.lifecycle;
          callback(event);
        };
        return () => {
          onAgentEvent = null;
        };
      },
      hasInFlightRun: () => lastLifecycle === "running",
    },
    workspaceGitService: {
      onSnapshotUpdated: (listener: (next: WorkspaceGitRuntimeSnapshot) => void) => {
        onSnapshotUpdated = listener;
        return { unsubscribe: vi.fn() };
      },
      getSnapshot,
    },
    listActiveWorkspaces: async () => [{ workspaceId: "workspace-a", cwd: CWD }],
  } as unknown as AutoArchiveOnMergeOptions;
  const archiveIfSafe = vi.fn(async () => (outcomes.shift() ?? (async () => "skipped"))());
  const deps = { archiveIfSafe, resolvePath: resolve } as AutoArchiveOnMergeDependencies;
  const subscription = setupAutoArchiveOnMerge(options, deps);
  return {
    archiveIfSafe,
    getSnapshot,
    subscription,
    emitSnapshot: (snapshot: WorkspaceGitRuntimeSnapshot) => onSnapshotUpdated?.(snapshot),
    emitAgent: (event: AgentManagerEvent) => onAgentEvent?.(event),
    hasAgentListener: () => onAgentEvent !== null,
  };
}

test("retries a deferred archive when an agent stops working, with no new snapshot", async () => {
  const journey = createJourney([async () => "deferred", async () => "archived"]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  journey.emitAgent(agentState("running"));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);

  journey.emitAgent(agentState("idle"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2));

  journey.emitAgent(agentState("idle"));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2);
});

test("an idle event during the archive flight is replayed once the flight ends", async () => {
  let release: (() => void) | null = null;
  const paused = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  const journey = createJourney([
    async () => {
      await paused;
      return "deferred";
    },
    async () => "archived",
  ]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));

  journey.emitAgent(agentState("idle"));
  (release as (() => void) | null)?.();

  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2));
});

test("unsubscribe also stops listening to agents", () => {
  const journey = createJourney([]);
  expect(journey.hasAgentListener()).toBe(true);
  journey.subscription.unsubscribe();
  expect(journey.hasAgentListener()).toBe(false);
});
