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

function agentState(
  lifecycle: ManagedAgent["lifecycle"],
  options?: { internal?: boolean; id?: string },
): AgentManagerEvent {
  return {
    type: "agent_state",
    agent: {
      id: options?.id ?? "agent-1",
      cwd: CWD,
      lifecycle,
      internal: options?.internal ?? false,
    } as ManagedAgent,
  };
}

function createJourney(outcomes: Array<() => Promise<ArchiveIfSafeOutcome>>) {
  let onSnapshotUpdated: ((snapshot: WorkspaceGitRuntimeSnapshot) => void) | null = null;
  let onAgentEvent: ((event: AgentManagerEvent) => void) | null = null;
  let lastLifecycle: ManagedAgent["lifecycle"] = "idle";
  let inFlightRun = false;
  const getSnapshot = vi.fn(async () => createSnapshot("merged"));
  const options = {
    logger: { child: () => ({ warn: vi.fn(), info: vi.fn() }) } as unknown as Logger,
    daemonConfigStore: { get: () => ({ autoArchiveAfterMerge: true }) },
    agentManager: {
      // Mirrors AgentManager.subscribe: a global (no agentId) subscriber only sees
      // internal-agent events when it opted in via includeInternalAgentEvents.
      subscribe: (
        callback: (event: AgentManagerEvent) => void,
        subscribeOptions?: { includeInternalAgentEvents?: boolean },
      ) => {
        onAgentEvent = (event) => {
          if (event.type === "agent_state") lastLifecycle = event.agent.lifecycle;
          if (
            event.type === "agent_state" &&
            event.agent.internal &&
            !subscribeOptions?.includeInternalAgentEvents
          ) {
            return;
          }
          callback(event);
        };
        return () => {
          onAgentEvent = null;
        };
      },
      hasInFlightRun: () => inFlightRun || lastLifecycle === "running",
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
  const archiveIfSafe = vi.fn(
    async (_input: Parameters<AutoArchiveOnMergeDependencies["archiveIfSafe"]>[0]) =>
      (outcomes.shift() ?? (async () => "skipped"))(),
  );
  const deps = { archiveIfSafe, resolvePath: resolve } as AutoArchiveOnMergeDependencies;
  const subscription = setupAutoArchiveOnMerge(options, deps);
  return {
    archiveIfSafe,
    getSnapshot,
    subscription,
    emitSnapshot: (snapshot: WorkspaceGitRuntimeSnapshot) => onSnapshotUpdated?.(snapshot),
    emitAgent: (event: AgentManagerEvent) => onAgentEvent?.(event),
    hasAgentListener: () => onAgentEvent !== null,
    setInFlightRun: (value: boolean) => {
      inFlightRun = value;
    },
  };
}

test("idle state replays after the terminal run settles", async () => {
  const journey = createJourney([async () => "deferred", async () => "archived"]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));
  journey.setInFlightRun(true);
  journey.emitAgent(agentState("idle"));
  journey.setInFlightRun(false);
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2));
  journey.subscription.unsubscribe();
});

test("a deferred idle agent gets a bounded timer retry without another event", async () => {
  vi.useFakeTimers();
  try {
    const journey = createJourney([async () => "deferred", async () => "archived"]);
    journey.emitSnapshot(createSnapshot("open"));
    journey.emitSnapshot(createSnapshot("merged"));
    await vi.advanceTimersByTimeAsync(0);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2);
    journey.subscription.unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});

test("timer retries stop after five attempts", async () => {
  vi.useFakeTimers();
  try {
    const journey = createJourney(Array.from({ length: 7 }, () => async () => "deferred" as const));
    journey.emitSnapshot(createSnapshot("open"));
    journey.emitSnapshot(createSnapshot("merged"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(155_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(6);
    journey.subscription.unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});

test.each(["error", "closed"] as const)(
  "%s agent state replays after timer retries are exhausted",
  async (lifecycle) => {
    vi.useFakeTimers();
    try {
      const outcomes = Array.from({ length: 6 }, () => async () => "deferred" as const);
      const journey = createJourney([...outcomes, async () => "archived"]);
      journey.emitSnapshot(createSnapshot("open"));
      journey.emitSnapshot(createSnapshot("merged"));
      await vi.advanceTimersByTimeAsync(155_000);
      expect(journey.archiveIfSafe).toHaveBeenCalledTimes(6);

      journey.emitAgent(agentState(lifecycle));
      await vi.advanceTimersByTimeAsync(0);
      expect(journey.archiveIfSafe).toHaveBeenCalledTimes(7);
      journey.subscription.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  },
);

test("an internal agent going idle replays after timer retries are exhausted", async () => {
  vi.useFakeTimers();
  try {
    const outcomes = Array.from({ length: 6 }, () => async () => "deferred" as const);
    const journey = createJourney([...outcomes, async () => "archived"]);
    journey.emitSnapshot(createSnapshot("open"));
    journey.emitSnapshot(createSnapshot("merged"));
    await vi.advanceTimersByTimeAsync(155_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(6);

    journey.emitAgent(agentState("idle", { internal: true, id: "internal-agent-1" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(7);
    journey.subscription.unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});

test("a failed terminal-event read re-arms exhausted retries", async () => {
  vi.useFakeTimers();
  try {
    const outcomes = Array.from({ length: 6 }, () => async () => "deferred" as const);
    const journey = createJourney([...outcomes, async () => "archived"]);
    journey.emitSnapshot(createSnapshot("open"));
    journey.emitSnapshot(createSnapshot("merged"));
    await vi.advanceTimersByTimeAsync(155_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(6);

    journey.getSnapshot.mockRejectedValueOnce(new Error("transient read failure"));
    journey.emitAgent(agentState("error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(journey.getSnapshot).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(7);
    journey.subscription.unsubscribe();
  } finally {
    vi.useRealTimers();
  }
});

test("a failed fresh read retains the deferred archive", async () => {
  const journey = createJourney([async () => "deferred", async () => "archived"]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));
  journey.getSnapshot.mockRejectedValueOnce(new Error("read failed"));
  journey.emitAgent(agentState("idle"));
  await vi.waitFor(() => expect(journey.getSnapshot).toHaveBeenCalledTimes(2));
  journey.emitAgent(agentState("idle"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(2));
  journey.subscription.unsubscribe();
});

test("unsubscribe cancels a queued idle replay", async () => {
  const journey = createJourney([async () => "deferred", async () => "archived"]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));
  journey.emitAgent(agentState("idle"));
  journey.subscription.unsubscribe();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);
});

test("unsubscribe stops an attempt awaiting a fresh snapshot", async () => {
  let release: (snapshot: WorkspaceGitRuntimeSnapshot) => void = () => {};
  const pending = new Promise<WorkspaceGitRuntimeSnapshot>((resolvePromise) => {
    release = resolvePromise;
  });
  const journey = createJourney([async () => "archived"]);
  journey.getSnapshot.mockImplementationOnce(() => pending);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.getSnapshot).toHaveBeenCalledTimes(1));
  journey.subscription.unsubscribe();
  release(createSnapshot("merged"));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  expect(journey.archiveIfSafe).not.toHaveBeenCalled();
});

test("unsubscribe reaches an archive already in progress", async () => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  const journey = createJourney([
    async () => {
      await pending;
      return "deferred";
    },
  ]);
  journey.emitSnapshot(createSnapshot("open"));
  journey.emitSnapshot(createSnapshot("merged"));
  await vi.waitFor(() => expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1));
  const isCancelled = journey.archiveIfSafe.mock.calls[0]?.[0].isCancelled;
  expect(isCancelled?.()).toBe(false);

  journey.subscription.unsubscribe();
  expect(isCancelled?.()).toBe(true);
  release();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);
});

test("unsubscribe cancels a deferred timer retry", async () => {
  vi.useFakeTimers();
  try {
    const journey = createJourney([async () => "deferred", async () => "archived"]);
    journey.emitSnapshot(createSnapshot("open"));
    journey.emitSnapshot(createSnapshot("merged"));
    await vi.advanceTimersByTimeAsync(0);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);
    journey.subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(journey.archiveIfSafe).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

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
