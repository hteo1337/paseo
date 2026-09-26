import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Logger } from "pino";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  archiveIfSafe,
  type ArchiveIfSafeDependencies,
  type AutoArchiveArchiveOptions,
} from "./archive-if-safe.js";
import type { ArchiveResult, ActiveWorkspaceRef } from "../workspace-archive-service.js";
import type { WorkspaceGitRuntimeSnapshot } from "../workspace-git-service.js";
import { createWorktree, type WorktreeConfig } from "../../utils/worktree.js";
import type { ForgeService } from "../../../services/forge-service.js";
import { AgentManager } from "../agent/agent-manager.js";
import { AgentStorage, type StoredAgentRecord } from "../agent/agent-storage.js";
import type {
  AgentClient,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
} from "../agent/agent-sdk-types.js";

const CWD = "/tmp/paseo/worktrees/repo/branch";
const PASEO_HOME = "/tmp/paseo";
const WORKTREES_ROOT = "/tmp/paseo/worktrees/repo";

function createPullRequest(
  overrides?: Partial<NonNullable<WorkspaceGitRuntimeSnapshot["forge"]["pullRequest"]>>,
): NonNullable<WorkspaceGitRuntimeSnapshot["forge"]["pullRequest"]> {
  return {
    url: "https://github.com/acme/repo/pull/123",
    title: "Merge me",
    state: "open",
    baseRefName: "main",
    headRefName: "feature",
    isMerged: true,
    ...overrides,
  };
}

function createSnapshot(overrides?: {
  git?: Partial<WorkspaceGitRuntimeSnapshot["git"]>;
  pullRequest?: WorkspaceGitRuntimeSnapshot["forge"]["pullRequest"];
}): WorkspaceGitRuntimeSnapshot {
  return {
    cwd: CWD,
    git: {
      isGit: true,
      repoRoot: "/tmp/repo",
      mainRepoRoot: "/tmp/repo",
      currentBranch: "feature",
      remoteUrl: "https://github.com/acme/repo.git",
      isPaseoOwnedWorktree: true,
      isDirty: false,
      baseRef: "main",
      aheadBehind: { ahead: 0, behind: 0 },
      aheadOfOrigin: 0,
      behindOfOrigin: 0,
      hasRemote: true,
      diffStat: { additions: 0, deletions: 0 },
      ...overrides?.git,
    },
    forge: {
      featuresEnabled: true,
      authState: "authenticated",
      pullRequest:
        overrides && "pullRequest" in overrides
          ? (overrides.pullRequest ?? null)
          : createPullRequest(),
      error: null,
    },
  };
}

function createLogger(): Logger {
  const logger = {
    child: () => logger,
    info: vi.fn(),
    warn: vi.fn(),
  };
  return logger as unknown as Logger;
}

function createHarness(overrides?: {
  autoArchivedChangeRequestUrl?: string | null;
  snapshot?: WorkspaceGitRuntimeSnapshot;
  isPaseoOwnedWorktreeCwd?: ArchiveIfSafeDependencies["isPaseoOwnedWorktreeCwd"];
  archiveByScope?: ArchiveIfSafeDependencies["archiveByScope"];
  agents?: Array<{ id: string; cwd: string; workspaceId?: string; lifecycle: string }>;
}) {
  const getSnapshot = vi.fn(async () =>
    createSnapshot(),
  ) as unknown as AutoArchiveArchiveOptions["workspaceGitService"]["getSnapshot"];
  const workspaceGitService = {
    getSnapshot,
  } as unknown as AutoArchiveArchiveOptions["workspaceGitService"];
  const options: AutoArchiveArchiveOptions = {
    paseoHome: PASEO_HOME,
    daemonConfigStore: {
      get: () => ({ autoArchiveAfterMerge: true }),
    } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
    workspaceGitService,
    github: {} as AutoArchiveArchiveOptions["github"],
    agentManager: {
      listAgents: () => overrides?.agents ?? [],
      listAgentsIncludingInternal: () => overrides?.agents ?? [],
      hasInFlightRun: (agentId: string) =>
        overrides?.agents?.some((agent) => agent.id === agentId && agent.lifecycle === "running") ??
        false,
      holdNewRunsForArchive: () => () => {},
    } as unknown as AutoArchiveArchiveOptions["agentManager"],
    agentStorage: {} as AutoArchiveArchiveOptions["agentStorage"],
    terminalManager: {} as AutoArchiveArchiveOptions["terminalManager"],
    findWorkspaceIdForCwd: vi.fn(async () => "ws-auto-archive"),
    listActiveWorkspaces: vi.fn(async () => []),
    getAutoArchivedChangeRequestUrl: vi.fn(
      async () => overrides?.autoArchivedChangeRequestUrl ?? null,
    ),
    archiveWorkspaceRecord: vi.fn(),
    markWorkspaceArchiving: vi.fn(),
    clearWorkspaceArchiving: vi.fn(),
    emitWorkspaceUpdatesForWorkspaceIds: vi.fn(),
  };
  const archiveByScope = vi.fn(
    overrides?.archiveByScope ??
      (async () =>
        ({
          archivedAgentIds: [],
          archivedWorkspaceIds: [],
          removedDirectory: false,
        }) satisfies ArchiveResult),
  ) as unknown as ArchiveIfSafeDependencies["archiveByScope"];
  const isPaseoOwnedWorktreeCwd = vi.fn(
    overrides?.isPaseoOwnedWorktreeCwd ??
      (async () => ({
        allowed: true,
        repoRoot: "/tmp/repo",
        worktreeRoot: WORKTREES_ROOT,
        worktreePath: CWD,
      })),
  ) as unknown as ArchiveIfSafeDependencies["isPaseoOwnedWorktreeCwd"];
  const deps: ArchiveIfSafeDependencies = {
    archiveByScope,
    isPaseoOwnedWorktreeCwd,
    killTerminalsForWorkspace: vi.fn(),
  };
  const log = createLogger();
  return {
    deps,
    getSnapshot,
    log,
    options,
    snapshot: overrides?.snapshot ?? createSnapshot(),
  };
}

async function runArchiveIfSafe(
  harness: ReturnType<typeof createHarness>,
  overrides?: {
    workspaceId?: string;
    snapshot?: WorkspaceGitRuntimeSnapshot;
    pullRequest?: WorkspaceGitRuntimeSnapshot["forge"]["pullRequest"];
  },
): Promise<void> {
  await archiveIfSafe({
    workspaceId: overrides?.workspaceId ?? "ws-auto-archive",
    snapshot:
      overrides?.snapshot ??
      (overrides && "pullRequest" in overrides
        ? createSnapshot({ pullRequest: overrides.pullRequest ?? null })
        : harness.snapshot),
    options: harness.options,
    log: harness.log,
    deps: harness.deps,
  });
}

const cleanupPaths: string[] = [];

function createGitRepo(): { tempDir: string; repoDir: string } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "archive-if-safe-"));
  cleanupPaths.push(tempDir);
  const repoDir = path.join(tempDir, "repo");
  mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@getpaseo.local"], {
    cwd: repoDir,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Paseo Test"], {
    cwd: repoDir,
    stdio: "pipe",
  });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "initial"], {
    cwd: repoDir,
    stdio: "pipe",
  });
  return { tempDir, repoDir };
}

async function createPaseoOwnedWorktree(
  repoDir: string,
  paseoHome: string,
  worktreeSlug: string,
): Promise<WorktreeConfig> {
  return createWorktree({
    cwd: repoDir,
    worktreeSlug,
    source: {
      kind: "branch-off",
      baseBranch: "main",
      branchName: worktreeSlug,
    },
    runSetup: false,
    paseoHome,
  });
}

function createGitHubServiceStub(): ForgeService {
  return {
    listPullRequests: async () => [],
    listIssues: async () => [],
    searchIssuesAndPrs: async () => ({
      items: [],
      featuresEnabled: true,
      githubFeaturesEnabled: true,
    }),
    getPullRequest: async ({ number }) => ({
      number,
      title: `PR ${number}`,
      url: `https://github.com/acme/repo/pull/${number}`,
      state: "OPEN",
      body: null,
      baseRefName: "main",
      headRefName: `pr-${number}`,
      labels: [],
    }),
    getPullRequestHeadRef: async ({ number }) => `pr-${number}`,
    getPullRequestCheckoutTarget: async ({ number }) => ({
      number,
      baseRefName: "main",
      headRefName: `pr-${number}`,
      headOwnerLogin: null,
      headRepositorySshUrl: null,
      headRepositoryUrl: null,
      isCrossRepository: false,
    }),
    getCurrentPullRequestStatus: async () => null,
    createPullRequest: async () => ({
      number: 1,
      url: "https://github.com/acme/repo/pull/1",
    }),
    mergePullRequest: async () => ({ success: true }),
    isAuthenticated: async () => true,
    invalidate: () => {},
  };
}

const RACE_CAPABILITIES = {
  supportsStreaming: false,
  supportsSessionPersistence: false,
  supportsSessionListing: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
} as const;

// Minimal fake session/client so a test can push a provider event
// (turn_started) synchronously, mirroring a real out-of-band provider turn.
class RaceSession {
  readonly provider = "codex" as const;
  readonly capabilities = RACE_CAPABILITIES;
  readonly id = `race-${Math.random().toString(36).slice(2)}`;
  closed = false;
  private subs = new Set<(event: AgentStreamEvent) => void>();
  constructor(private readonly config: AgentSessionConfig) {}
  async run() {
    return { sessionId: this.id, finalText: "", timeline: [] };
  }
  async startTurn() {
    return { turnId: "t" };
  }
  subscribe(callback: (event: AgentStreamEvent) => void) {
    this.subs.add(callback);
    return () => this.subs.delete(callback);
  }
  push(event: AgentStreamEvent) {
    for (const callback of this.subs) callback(event);
  }
  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {}
  async getRuntimeInfo() {
    return { provider: this.provider, sessionId: this.id, model: null, modeId: null };
  }
  async getAvailableModes() {
    return [];
  }
  async getCurrentMode() {
    return null;
  }
  async setMode() {}
  getPendingPermissions() {
    return [];
  }
  async respondToPermission() {}
  describePersistence() {
    return { provider: this.provider, sessionId: this.id };
  }
  async interrupt() {}
  async close() {
    this.closed = true;
  }
}

class RaceClient {
  readonly provider = "codex" as const;
  readonly capabilities = RACE_CAPABILITIES;
  sessions: RaceSession[] = [];
  async isAvailable() {
    return true;
  }
  async fetchCatalog() {
    return { models: [{ provider: "codex", id: "m", label: "m", isDefault: true }], modes: [] };
  }
  async createSession(config: AgentSessionConfig) {
    const session = new RaceSession(config);
    this.sessions.push(session);
    return session as unknown as AgentSession;
  }
  async resumeSession(_handle: unknown, config?: Partial<AgentSessionConfig>) {
    return this.createSession({ provider: "codex", cwd: config?.cwd ?? "/" } as AgentSessionConfig);
  }
}

function createRealOutcomeHarness(input: {
  paseoHome: string;
  repoDir: string;
  worktreePath: string;
  activeWorkspaces: ActiveWorkspaceRef[];
  archivedWorkspaceIds: Set<string>;
}) {
  const active = [...input.activeWorkspaces];
  const autoArchivedChangeRequestUrls = new Map<string, string>();
  const logger = pino({ level: "silent" });
  vi.spyOn(logger, "info").mockImplementation(() => undefined);
  vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  vi.spyOn(logger, "error").mockImplementation(() => undefined);

  const options: AutoArchiveArchiveOptions = {
    paseoHome: input.paseoHome,
    daemonConfigStore: {
      get: () => ({ autoArchiveAfterMerge: true }),
    } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
    workspaceGitService: {
      getSnapshot: async () =>
        ({
          cwd: input.worktreePath,
          git: {
            isGit: true,
            repoRoot: input.repoDir,
            mainRepoRoot: input.repoDir,
            currentBranch: "feature",
            remoteUrl: "https://github.com/acme/repo.git",
            isPaseoOwnedWorktree: true,
            isDirty: false,
            baseRef: "main",
            aheadBehind: { ahead: 0, behind: 0 },
            aheadOfOrigin: 0,
            behindOfOrigin: 0,
            hasRemote: true,
            diffStat: { additions: 0, deletions: 0 },
          },
          forge: {
            featuresEnabled: true,
            authState: "authenticated",
            pullRequest: createPullRequest({ isMerged: true }),
            error: null,
          },
        }) satisfies WorkspaceGitRuntimeSnapshot,
    } as unknown as AutoArchiveArchiveOptions["workspaceGitService"],
    github: createGitHubServiceStub(),
    agentManager: {
      listAgents: () => [],
      listAgentsIncludingInternal: () => [],
      hasInFlightRun: () => false,
      holdNewRunsForArchive: () => () => {},
      archiveAgent: vi.fn(async () => ({ archivedAt: new Date().toISOString() })),
      archiveSnapshot: vi.fn(async () => {
        throw new Error("not expected without stored agents");
      }),
    } as unknown as AutoArchiveArchiveOptions["agentManager"],
    agentStorage: {
      list: async (): Promise<StoredAgentRecord[]> => [],
    } as unknown as AutoArchiveArchiveOptions["agentStorage"],
    terminalManager: {
      listDirectories: () => [],
      getTerminals: vi.fn().mockResolvedValue([]),
    } as unknown as AutoArchiveArchiveOptions["terminalManager"],
    findWorkspaceIdForCwd: async (cwd: string) => {
      const match = active.find((workspace) => workspace.cwd === cwd);
      return match?.workspaceId ?? null;
    },
    listActiveWorkspaces: async () =>
      active.filter((workspace) => !input.archivedWorkspaceIds.has(workspace.workspaceId)),
    getAutoArchivedChangeRequestUrl: async (workspaceId: string) =>
      autoArchivedChangeRequestUrls.get(workspaceId) ?? null,
    archiveWorkspaceRecord: async (workspaceId: string, context) => {
      if (context?.autoArchivedChangeRequestUrl) {
        autoArchivedChangeRequestUrls.set(workspaceId, context.autoArchivedChangeRequestUrl);
      }
      input.archivedWorkspaceIds.add(workspaceId);
      const index = active.findIndex((workspace) => workspace.workspaceId === workspaceId);
      if (index !== -1) {
        active.splice(index, 1);
      }
    },
    markWorkspaceArchiving: () => {},
    clearWorkspaceArchiving: () => {},
    emitWorkspaceUpdatesForWorkspaceIds: vi.fn(),
  };

  return {
    options,
    log: logger,
    unarchiveWorkspace(workspace: ActiveWorkspaceRef) {
      input.archivedWorkspaceIds.delete(workspace.workspaceId);
      active.push(workspace);
    },
  };
}

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    rmSync(target, { recursive: true, force: true });
  }
});

describe("archiveIfSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does nothing when the pull request is not merged", async () => {
    const harness = createHarness();

    await runArchiveIfSafe(harness, { pullRequest: createPullRequest({ isMerged: false }) });

    expect(harness.getSnapshot).not.toHaveBeenCalled();
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("does nothing when the worktree is dirty", async () => {
    const harness = createHarness({
      snapshot: createSnapshot({ git: { isDirty: true } }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isPaseoOwnedWorktreeCwd).not.toHaveBeenCalled();
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("does nothing when the worktree is ahead of origin", async () => {
    const harness = createHarness({
      snapshot: createSnapshot({ git: { aheadOfOrigin: 1 } }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isPaseoOwnedWorktreeCwd).not.toHaveBeenCalled();
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("archives when the PR is merged and the upstream branch was deleted", async () => {
    const harness = createHarness({
      snapshot: createSnapshot({ git: { aheadOfOrigin: null, behindOfOrigin: null } }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).toHaveBeenCalledTimes(1);
  });

  test("does nothing when the cwd is not a Paseo-owned worktree", async () => {
    const harness = createHarness({
      isPaseoOwnedWorktreeCwd: async () => ({ allowed: false, worktreePath: CWD }),
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.isPaseoOwnedWorktreeCwd).toHaveBeenCalledWith(CWD, {
      paseoHome: PASEO_HOME,
    });
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("logs and does not throw when archiving fails", async () => {
    const harness = createHarness({
      archiveByScope: async () => {
        throw new Error("archive failed");
      },
    });

    await runArchiveIfSafe(harness);

    expect(harness.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error), cwd: CWD },
      "Auto-archive after merge failed",
    );
  });

  test("archives a clean Paseo-owned worktree after merge", async () => {
    const harness = createHarness();

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).toHaveBeenCalledTimes(1);
    expect(harness.deps.archiveByScope).toHaveBeenCalledWith(
      expect.objectContaining({
        paseoHome: PASEO_HOME,
        workspaceGitService: harness.options.workspaceGitService,
      }),
      {
        scope: { kind: "workspace", workspaceId: "ws-auto-archive" },
        requestId: "auto-archive-on-merge",
        abortIf: expect.any(Function),
        holdNewRuns: expect.any(Function),
        keepDirectory: true,
      },
    );
    expect(harness.log.info).toHaveBeenCalledWith(
      {
        workspaceId: "ws-auto-archive",
        cwd: CWD,
        branch: "feature",
        pullRequestUrl: "https://github.com/acme/repo/pull/123",
      },
      "Auto-archived workspace after PR merge",
    );
  });

  test("maps a late busy agent from archiveByScope to deferred", async () => {
    const harness = createHarness({
      archiveByScope: async () => ({
        archivedAgentIds: [],
        archivedWorkspaceIds: [],
        removedDirectory: false,
        deferredByAgentIds: ["agent-late"],
      }),
    });

    const outcome = await archiveIfSafe({
      workspaceId: "ws-auto-archive",
      snapshot: createSnapshot(),
      options: harness.options,
      log: harness.log,
      deps: harness.deps,
    });

    expect(outcome).toBe("deferred");
  });

  test("cancellation during ownership lookup prevents archive", async () => {
    let releaseOwnership: () => void = () => {};
    let enteredOwnership = false;
    let cancelled = false;
    const ownership = new Promise<void>((resolvePromise) => {
      releaseOwnership = resolvePromise;
    });
    const harness = createHarness({
      isPaseoOwnedWorktreeCwd: async () => {
        enteredOwnership = true;
        await ownership;
        return { allowed: true, worktreePath: CWD };
      },
    });
    const request = {
      workspaceId: "ws-auto-archive",
      snapshot: createSnapshot(),
      options: harness.options,
      log: harness.log,
      deps: harness.deps,
      isCancelled: () => cancelled,
    };

    const attempt = archiveIfSafe(request);
    await vi.waitFor(() => expect(enteredOwnership).toBe(true));
    cancelled = true;
    releaseOwnership();

    expect(await attempt).toBe("skipped");
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("cancellation during archive target resolution reaches the final guard", async () => {
    let cancelled = false;
    let guardResult: string[] | "cancelled" | null | undefined;
    const harness = createHarness({
      archiveByScope: async (_dependencies, request) => {
        cancelled = true;
        guardResult = request.abortIf?.();
        return {
          archivedAgentIds: [],
          archivedWorkspaceIds: [],
          removedDirectory: false,
          cancelled: guardResult === "cancelled",
        };
      },
    });
    const request = {
      workspaceId: "ws-auto-archive",
      snapshot: createSnapshot(),
      options: harness.options,
      log: harness.log,
      deps: harness.deps,
      isCancelled: () => cancelled,
    };

    expect(guardResult).toBeUndefined();
    expect(await archiveIfSafe(request)).toBe("skipped");
    expect(guardResult).toBe("cancelled");
  });

  test.each(["running", "initializing"])(
    "defers while an agent of the workspace is %s",
    async (lifecycle) => {
      const harness = createHarness({
        agents: [{ id: "a1", cwd: "/elsewhere", workspaceId: "ws-auto-archive", lifecycle }],
      });

      await runArchiveIfSafe(harness);

      expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
      expect(harness.log.info).toHaveBeenCalledWith(
        { workspaceId: "ws-auto-archive", cwd: CWD, agentIds: ["a1"] },
        "Deferred auto-archive after PR merge: agent still working",
      );
    },
  );

  test("defers while an agent of another workspace runs inside the worktree", async () => {
    const harness = createHarness({
      agents: [
        { id: "a2", cwd: `${CWD}/packages/app`, workspaceId: "ws-other", lifecycle: "running" },
      ],
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("defers for an idle agent owned by another workspace inside the worktree", async () => {
    const harness = createHarness({
      agents: [
        { id: "foreign-idle", cwd: `${CWD}/child`, workspaceId: "ws-other", lifecycle: "idle" },
      ],
    });

    const outcome = await archiveIfSafe({
      workspaceId: "ws-auto-archive",
      snapshot: harness.snapshot,
      options: harness.options,
      log: harness.log,
      deps: harness.deps,
    });

    expect(outcome).toBe("deferred");
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("archives once the agent is idle, and ignores agents elsewhere", async () => {
    const agents = [
      { id: "a1", cwd: CWD, workspaceId: "ws-auto-archive", lifecycle: "running" },
      { id: "a3", cwd: `${CWD}-sibling`, workspaceId: "ws-other", lifecycle: "running" },
    ];
    const harness = createHarness({ agents });

    await runArchiveIfSafe(harness);
    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();

    agents[0]!.lifecycle = "idle";
    await runArchiveIfSafe(harness);
    expect(harness.deps.archiveByScope).toHaveBeenCalledTimes(1);
  });

  test("guards the whole worktree, not only the workspace cwd", async () => {
    const harness = createHarness({
      agents: [{ id: "a4", cwd: `${CWD}/pkg-b`, workspaceId: "ws-other", lifecycle: "running" }],
    });

    await runArchiveIfSafe(harness, { snapshot: { ...createSnapshot(), cwd: `${CWD}/pkg-a` } });

    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("matches an agent that reaches the worktree through a symlink", async () => {
    const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), "archive-if-safe-link-")));
    cleanupPaths.push(tempDir);
    const worktreePath = path.join(tempDir, "tree");
    mkdirSync(worktreePath);
    symlinkSync(worktreePath, path.join(tempDir, "alias"));
    const harness = createHarness({
      agents: [
        {
          id: "a5",
          cwd: path.join(tempDir, "alias"),
          workspaceId: "ws-other",
          lifecycle: "running",
        },
      ],
      isPaseoOwnedWorktreeCwd: async () => ({
        allowed: true,
        repoRoot: "/tmp/repo",
        worktreeRoot: tempDir,
        worktreePath,
      }),
    });

    await runArchiveIfSafe(harness, { snapshot: { ...createSnapshot(), cwd: worktreePath } });

    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("defers when a turn starts while the consumed-merge lookup is pending", async () => {
    const agents = [{ id: "a6", cwd: CWD, workspaceId: "ws-auto-archive", lifecycle: "idle" }];
    const harness = createHarness({ agents });
    harness.options.getAutoArchivedChangeRequestUrl = async () => {
      agents[0]!.lifecycle = "running";
      return null;
    };

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("does not archive a merge event already consumed by this workspace", async () => {
    const harness = createHarness({
      autoArchivedChangeRequestUrl: "https://github.com/acme/repo/pull/123",
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).not.toHaveBeenCalled();
  });

  test("archives a different merged change request", async () => {
    const harness = createHarness({
      autoArchivedChangeRequestUrl: "https://github.com/acme/repo/pull/122",
    });

    await runArchiveIfSafe(harness);

    expect(harness.deps.archiveByScope).toHaveBeenCalledTimes(1);
  });

  test("records the consumed change request in the workspace archive mutation", async () => {
    const harness = createHarness({
      archiveByScope: async (dependencies) => {
        await dependencies.archiveWorkspaceRecord("ws-auto-archive");
        return {
          archivedAgentIds: [],
          archivedWorkspaceIds: ["ws-auto-archive"],
          removedDirectory: false,
        };
      },
    });

    await runArchiveIfSafe(harness);

    expect(harness.options.archiveWorkspaceRecord).toHaveBeenCalledWith("ws-auto-archive", {
      autoArchivedChangeRequestUrl: "https://github.com/acme/repo/pull/123",
    });
  });

  test("archives only the supplied workspace id and does not iterate siblings", async () => {
    const harness = createHarness();
    harness.options.listActiveWorkspaces = vi.fn(async () => [
      { workspaceId: "ws-merged-worktree", cwd: CWD, kind: "worktree" as const },
      { workspaceId: "ws-sibling", cwd: CWD, kind: "local_checkout" as const },
    ]);

    await runArchiveIfSafe(harness, { workspaceId: "ws-merged-worktree" });

    expect(harness.deps.archiveByScope).toHaveBeenCalledTimes(1);
    expect(harness.deps.archiveByScope).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        scope: { kind: "workspace", workspaceId: "ws-merged-worktree" },
      }),
    );
  });

  test("real outcome: keeps sibling workspace and directory on last reference", async () => {
    const { tempDir, repoDir } = createGitRepo();
    const paseoHome = path.join(tempDir, ".paseo");
    const worktree = await createPaseoOwnedWorktree(repoDir, paseoHome, "merged-with-sibling");
    const workspaceA = "ws-merged-with-sibling-a";
    const workspaceB = "ws-merged-with-sibling-b";
    const archivedWorkspaceIds = new Set<string>();

    const harness = createRealOutcomeHarness({
      paseoHome,
      repoDir,
      worktreePath: worktree.worktreePath,
      activeWorkspaces: [
        { workspaceId: workspaceA, cwd: worktree.worktreePath, kind: "worktree" },
        { workspaceId: workspaceB, cwd: worktree.worktreePath, kind: "local_checkout" },
      ],
      archivedWorkspaceIds,
    });

    await archiveIfSafe({
      workspaceId: workspaceA,
      snapshot: { ...createSnapshot(), cwd: worktree.worktreePath },
      options: harness.options,
      log: harness.log,
    });

    expect(archivedWorkspaceIds.has(workspaceA)).toBe(true);
    expect(archivedWorkspaceIds.has(workspaceB)).toBe(false);
    expect(existsSync(worktree.worktreePath)).toBe(true);
  });

  test("real outcome: keeps the worktree without running teardown after merge", async () => {
    const { tempDir, repoDir } = createGitRepo();
    writeFileSync(
      path.join(repoDir, "paseo.json"),
      JSON.stringify({
        worktree: {
          teardown: [
            "node -e \"require('fs').writeFileSync(process.env.PASEO_SOURCE_CHECKOUT_PATH + '/auto-teardown.log', 'ran')\"",
          ],
        },
      }),
    );
    execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "pipe" });
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "add teardown"], {
      cwd: repoDir,
      stdio: "pipe",
    });
    const paseoHome = path.join(tempDir, ".paseo");
    const worktree = await createPaseoOwnedWorktree(repoDir, paseoHome, "merged-last-ref");
    const workspaceA = "ws-merged-last-ref";
    const archivedWorkspaceIds = new Set<string>();

    const harness = createRealOutcomeHarness({
      paseoHome,
      repoDir,
      worktreePath: worktree.worktreePath,
      activeWorkspaces: [{ workspaceId: workspaceA, cwd: worktree.worktreePath, kind: "worktree" }],
      archivedWorkspaceIds,
    });

    const outcome = await archiveIfSafe({
      workspaceId: workspaceA,
      snapshot: { ...createSnapshot(), cwd: worktree.worktreePath },
      options: harness.options,
      log: harness.log,
    });

    expect(outcome).toBe("archived");
    expect(archivedWorkspaceIds.has(workspaceA)).toBe(true);
    expect(existsSync(worktree.worktreePath)).toBe(true);
    expect(existsSync(path.join(repoDir, "auto-teardown.log"))).toBe(false);
    expect(harness.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("merged-last-ref") }),
      expect.stringContaining("kept"),
    );
  });

  test("real outcome: an unarchived workspace is not archived again for the same merged PR", async () => {
    const { tempDir, repoDir } = createGitRepo();
    const paseoHome = path.join(tempDir, ".paseo");
    const worktree = await createPaseoOwnedWorktree(repoDir, paseoHome, "merged-then-unarchived");
    const workspace = {
      workspaceId: "ws-merged-then-unarchived",
      cwd: worktree.worktreePath,
      kind: "worktree" as const,
    };
    const sibling = {
      workspaceId: "ws-directory-preserving-sibling",
      cwd: worktree.worktreePath,
      kind: "local_checkout" as const,
    };
    const archivedWorkspaceIds = new Set<string>();
    const harness = createRealOutcomeHarness({
      paseoHome,
      repoDir,
      worktreePath: worktree.worktreePath,
      activeWorkspaces: [workspace, sibling],
      archivedWorkspaceIds,
    });
    const mergedSnapshot = { ...createSnapshot(), cwd: worktree.worktreePath };

    await archiveIfSafe({
      workspaceId: workspace.workspaceId,
      snapshot: mergedSnapshot,
      options: harness.options,
      log: harness.log,
    });
    expect(archivedWorkspaceIds.has(workspace.workspaceId)).toBe(true);

    harness.unarchiveWorkspace(workspace);
    await archiveIfSafe({
      workspaceId: workspace.workspaceId,
      snapshot: mergedSnapshot,
      options: harness.options,
      log: harness.log,
    });

    expect(archivedWorkspaceIds.has(workspace.workspaceId)).toBe(false);
    expect(existsSync(worktree.worktreePath)).toBe(true);
  });

  // Regression for round-6 P2 A2: an internal agent must be as visible to the
  // busy check as a normal one, since listAgents() drops internal agents.
  test.each([true, false])(
    "regression: a working agent defers auto-archive regardless of internal flag (internal=%s)",
    async (internal) => {
      const { tempDir, repoDir } = createGitRepo();
      const paseoHome = path.join(tempDir, ".paseo");
      const worktree = await createPaseoOwnedWorktree(
        repoDir,
        paseoHome,
        `race-internal-${internal}`,
      );
      const workspaceId = `ws-race-internal-${internal}`;
      const archivedWorkspaceIds = new Set<string>();
      const realLogger = pino({ level: "silent" });
      const storage = new AgentStorage(path.join(tempDir, "agents"), realLogger);
      const client = new RaceClient();
      const manager = new AgentManager({
        clients: { codex: client as unknown as AgentClient },
        registry: storage,
        logger: realLogger,
      });
      const agent = await manager.createAgent(
        { provider: "codex", cwd: worktree.worktreePath, internal } as AgentSessionConfig,
        undefined,
        { workspaceId },
      );
      client.sessions[0]?.push({
        type: "turn_started",
        provider: "codex",
        turnId: "working",
      } as AgentStreamEvent);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(manager.hasInFlightRun(agent.id)).toBe(true);

      const options = {
        paseoHome,
        daemonConfigStore: {
          get: () => ({ autoArchiveAfterMerge: true }),
        } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
        workspaceGitService: {
          getSnapshot: async () => null,
        } as unknown as AutoArchiveArchiveOptions["workspaceGitService"],
        github: createGitHubServiceStub(),
        agentManager: manager,
        agentStorage: storage,
        terminalManager: {} as unknown as AutoArchiveArchiveOptions["terminalManager"],
        findWorkspaceIdForCwd: async () => workspaceId,
        listActiveWorkspaces: async () =>
          archivedWorkspaceIds.has(workspaceId)
            ? []
            : [{ workspaceId, cwd: worktree.worktreePath, kind: "worktree" as const }],
        getAutoArchivedChangeRequestUrl: async () => null,
        archiveWorkspaceRecord: async (id: string) => void archivedWorkspaceIds.add(id),
        markWorkspaceArchiving: () => {},
        clearWorkspaceArchiving: () => {},
        emitWorkspaceUpdatesForWorkspaceIds: async () => {},
      } as unknown as AutoArchiveArchiveOptions;

      const outcome = await archiveIfSafe({
        workspaceId,
        snapshot: { ...createSnapshot(), cwd: worktree.worktreePath },
        options,
        log: createLogger(),
      });

      expect(outcome).toBe("deferred");
      expect(client.sessions[0]?.closed).toBe(false);
      expect(archivedWorkspaceIds.has(workspaceId)).toBe(false);
    },
  );

  // A turn starting mid-teardown must defer even for an internal agent.
  test("regression: an internal agent that starts working during teardown defers archive", async () => {
    const { tempDir, repoDir } = createGitRepo();
    const paseoHome = path.join(tempDir, ".paseo");
    const worktree = await createPaseoOwnedWorktree(repoDir, paseoHome, "internal-busy-teardown");
    const workspaceId = "ws-internal-busy-teardown";
    const archivedWorkspaceIds = new Set<string>();
    const realLogger = pino({ level: "silent" });
    const storage = new AgentStorage(path.join(tempDir, "agents"), realLogger);
    const client = new RaceClient();
    const manager = new AgentManager({
      clients: { codex: client as unknown as AgentClient },
      registry: storage,
      logger: realLogger,
    });
    await manager.createAgent(
      { provider: "codex", cwd: worktree.worktreePath, internal: true } as AgentSessionConfig,
      undefined,
      { workspaceId },
    );

    const applySnapshot = storage.applySnapshot.bind(storage);
    let armed = true;
    vi.spyOn(storage, "applySnapshot").mockImplementation(async (...args) => {
      if (armed) {
        armed = false;
        client.sessions[0]?.push({
          type: "turn_started",
          provider: "codex",
          turnId: "autonomous",
        } as AgentStreamEvent);
      }
      return applySnapshot(...args);
    });

    const options = {
      paseoHome,
      daemonConfigStore: {
        get: () => ({ autoArchiveAfterMerge: true }),
      } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
      workspaceGitService: {
        getSnapshot: async () => null,
      } as unknown as AutoArchiveArchiveOptions["workspaceGitService"],
      github: createGitHubServiceStub(),
      agentManager: manager,
      agentStorage: storage,
      terminalManager: {} as unknown as AutoArchiveArchiveOptions["terminalManager"],
      findWorkspaceIdForCwd: async () => workspaceId,
      listActiveWorkspaces: async () =>
        archivedWorkspaceIds.has(workspaceId)
          ? []
          : [{ workspaceId, cwd: worktree.worktreePath, kind: "worktree" as const }],
      getAutoArchivedChangeRequestUrl: async () => null,
      archiveWorkspaceRecord: async (id: string) => void archivedWorkspaceIds.add(id),
      markWorkspaceArchiving: () => {},
      clearWorkspaceArchiving: () => {},
      emitWorkspaceUpdatesForWorkspaceIds: async () => {},
    } as unknown as AutoArchiveArchiveOptions;

    const outcome = await archiveIfSafe({
      workspaceId,
      snapshot: { ...createSnapshot(), cwd: worktree.worktreePath },
      options,
      log: createLogger(),
    });

    // The push only fires if teardown actually attempted to close this agent.
    expect(armed).toBe(false);
    expect(outcome).toBe("deferred");
    expect(client.sessions[0]?.closed).toBe(false);
    expect(archivedWorkspaceIds.has(workspaceId)).toBe(false);
  });

  // An idle internal agent must still be closed, or auto-archive defers forever.
  test("closes an idle internal agent during teardown instead of deferring forever", async () => {
    const { tempDir, repoDir } = createGitRepo();
    const paseoHome = path.join(tempDir, ".paseo");
    const worktree = await createPaseoOwnedWorktree(repoDir, paseoHome, "internal-idle-teardown");
    const workspaceId = "ws-internal-idle-teardown";
    const archivedWorkspaceIds = new Set<string>();
    const realLogger = pino({ level: "silent" });
    const storage = new AgentStorage(path.join(tempDir, "agents"), realLogger);
    const client = new RaceClient();
    const manager = new AgentManager({
      clients: { codex: client as unknown as AgentClient },
      registry: storage,
      logger: realLogger,
    });
    await manager.createAgent(
      { provider: "codex", cwd: worktree.worktreePath, internal: true } as AgentSessionConfig,
      undefined,
      { workspaceId },
    );

    const options = {
      paseoHome,
      daemonConfigStore: {
        get: () => ({ autoArchiveAfterMerge: true }),
      } as unknown as AutoArchiveArchiveOptions["daemonConfigStore"],
      workspaceGitService: {
        getSnapshot: async () => null,
      } as unknown as AutoArchiveArchiveOptions["workspaceGitService"],
      github: createGitHubServiceStub(),
      agentManager: manager,
      agentStorage: storage,
      terminalManager: {} as unknown as AutoArchiveArchiveOptions["terminalManager"],
      findWorkspaceIdForCwd: async () => workspaceId,
      listActiveWorkspaces: async () =>
        archivedWorkspaceIds.has(workspaceId)
          ? []
          : [{ workspaceId, cwd: worktree.worktreePath, kind: "worktree" as const }],
      getAutoArchivedChangeRequestUrl: async () => null,
      archiveWorkspaceRecord: async (id: string) => void archivedWorkspaceIds.add(id),
      markWorkspaceArchiving: () => {},
      clearWorkspaceArchiving: () => {},
      emitWorkspaceUpdatesForWorkspaceIds: async () => {},
    } as unknown as AutoArchiveArchiveOptions;

    const outcome = await archiveIfSafe({
      workspaceId,
      snapshot: { ...createSnapshot(), cwd: worktree.worktreePath },
      options,
      log: createLogger(),
    });

    expect(outcome).toBe("archived");
    expect(client.sessions[0]?.closed).toBe(true);
    expect(archivedWorkspaceIds.has(workspaceId)).toBe(true);
  });
});
