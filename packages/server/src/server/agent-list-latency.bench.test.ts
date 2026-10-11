// Offline benchmark, investigation-only, not meant to be committed.
// npx vitest run src/server/agent-list-latency.bench.test.ts --reporter=verbose
import { test, vi } from "vitest";
import pino from "pino";
import { Session } from "./session.js";
import type { SessionOptions, SessionOutboundMessage } from "./messages.js";
import {
  asAgentManager,
  asAgentStorage,
  asDownloadTokenStore,
  asPushNotifications,
  asScheduleService,
  asCheckoutDiffManager,
  asGitHubService,
  asWorkspaceGitService,
  asDaemonConfigStore,
  createProviderSnapshotManagerStub,
  createMessageReceiptsStub,
  createTestCreationService,
} from "./test-utils/session-stubs.js";
import type { StoredAgentRecord } from "./agent/agent-storage.js";
import {
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
} from "./workspace-registry.js";
import { OWNER_PERMISSIONS } from "./authorization/index.js";

const TOTAL_ON_DISK = 1112; // matches live evidence: ~/.paseo/agents holds 1112 entries
const ARCHIVED_COUNT = 685; // filtered out before payload-building when includeArchived=false
const CLOSED_COUNT = 346; // persisted, not live
const IDLE_LIVE_COUNT = 81; // live in agentManager
const WORKSPACE_COUNT = 60; // distinct cwds spread across the population

function buildWorkspacesAndProjects() {
  const workspaces = [];
  const projects = [];
  for (let i = 0; i < WORKSPACE_COUNT; i++) {
    const projectId = `project-${i}`;
    const workspaceId = `workspace-${i}`;
    projects.push(
      createPersistedProjectRecord({
        projectId,
        rootPath: `/tmp/bench/project-${i}`,
        kind: "git",
        displayName: `Project ${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    workspaces.push(
      createPersistedWorkspaceRecord({
        workspaceId,
        projectId,
        cwd: `/tmp/bench/project-${i}`,
        kind: "local_checkout",
        displayName: `Workspace ${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  }
  return { workspaces, projects };
}

function buildStoredRecord(i: number, overrides: Partial<StoredAgentRecord>): StoredAgentRecord {
  const workspaceIndex = i % WORKSPACE_COUNT;
  return {
    id: `agent-${i}`,
    provider: "codex",
    cwd: `/tmp/bench/project-${workspaceIndex}`,
    workspaceId: `workspace-${workspaceIndex}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date(2026, 0, 1, 0, 0, i % 3600).toISOString(),
    lastUserMessageAt: null,
    title: `Agent ${i}`,
    labels: {},
    lastStatus: "closed",
    lastModeId: null,
    config: null,
    persistence: null,
    archivedAt: null,
    ...overrides,
  };
}

function buildManagedAgentLike(i: number) {
  const workspaceIndex = i % WORKSPACE_COUNT;
  return {
    id: `live-agent-${i}`,
    provider: "codex",
    cwd: `/tmp/bench/project-${workspaceIndex}`,
    workspaceId: `workspace-${workspaceIndex}`,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
      supportsRewindConversation: false,
      supportsRewindFiles: false,
      supportsRewindBoth: false,
    },
    config: { modeId: null, model: null, thinkingOptionId: null },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date(),
    availableModes: [],
    currentModeId: null,
    pendingPermissions: new Map(),
    persistence: null,
    lastUserMessageAt: null,
    activeTurnId: null,
    activeTurnStartedAt: null,
    attention: { requiresAttention: false } as const,
    labels: {},
    lifecycle: "idle" as const,
  };
}

function buildSession(options: {
  storedRecords: StoredAgentRecord[];
  liveAgents: unknown[];
  workspaces: ReturnType<typeof buildWorkspacesAndProjects>["workspaces"];
  projects: ReturnType<typeof buildWorkspacesAndProjects>["projects"];
}): { session: Session; messages: SessionOutboundMessage[] } {
  const { storedRecords, liveAgents, workspaces, projects } = options;
  const logger = pino({ level: "silent" });
  const messages: SessionOutboundMessage[] = [];
  const cache = new Map(storedRecords.map((r) => [r.id, r]));
  const workspaceById = new Map(workspaces.map((w) => [w.workspaceId, w]));
  const projectById = new Map(projects.map((p) => [p.projectId, p]));
  const providerSnapshotStub = createProviderSnapshotManagerStub();
  providerSnapshotStub.listRegisteredProviderIds.mockReturnValue(["codex"] as never);

  const sessionOptions: SessionOptions = {
    messageReceipts: createMessageReceiptsStub(),
    creationService: createTestCreationService(),
    clientId: "bench-client",
    onMessage: (message) => messages.push(message),
    onMessageToSource: (_source, message) => messages.push(message),
    onBinaryMessage: undefined,
    logger,
    downloadTokenStore: asDownloadTokenStore(),
    pushNotifications: asPushNotifications(),
    paseoHome: "/tmp/bench-paseo-home",
    agentManager: asAgentManager({
      listAgents: vi.fn(() => liveAgents),
      listProviderSubagentActivity: vi.fn(() => []),
      subscribe: vi.fn(() => () => {}),
    }),
    agentStorage: asAgentStorage({
      get: vi.fn(async (id: string) => cache.get(id) ?? null),
      list: vi.fn(async () => Array.from(cache.values())),
    }),
    projectRegistry: {
      list: vi.fn(async () => projects),
      get: vi.fn(async (id: string) => projectById.get(id) ?? null),
      getOrCreateActiveByRoot: vi.fn(),
      upsert: vi.fn(),
      archive: vi.fn(),
      remove: vi.fn(),
      initialize: vi.fn(),
      existsOnDisk: vi.fn(),
    },
    workspaceRegistry: {
      get: vi.fn(async (id: string) => workspaceById.get(id) ?? null),
      list: vi.fn(async () => workspaces),
    },
    scheduleService: asScheduleService(),
    checkoutDiffManager: asCheckoutDiffManager({ scheduleRefreshForCwd: vi.fn() }),
    github: asGitHubService({
      invalidate: vi.fn(),
      searchIssuesAndPrs: vi.fn(),
      createPullRequest: vi.fn(),
      mergePullRequest: vi.fn(),
    }),
    workspaceGitService: asWorkspaceGitService({
      getCheckout: vi.fn(),
      getCheckoutDiff: vi.fn(),
      getSnapshot: vi.fn(),
      suggestBranchesForCwd: vi.fn(),
      listStashes: vi.fn(),
      peekSnapshot: vi.fn(() => null),
      validateBranchRef: vi.fn(),
      hasLocalBranch: vi.fn(),
      resolveRepoRemoteUrl: vi.fn(),
      resolveRepoRoot: vi.fn(),
      resolveForge: vi.fn().mockResolvedValue({ forge: "github" }),
      invalidateForge: vi.fn(),
      getProjectSlug: vi.fn(),
      getWorkspaceGitMetadata: vi.fn(),
    }),
    daemonConfigStore: asDaemonConfigStore({
      get: vi.fn(() => ({ mcp: { injectIntoAgents: false }, providers: {} })),
      onChange: vi.fn(() => () => {}),
    }),
    stt: null,
    tts: null,
    terminalManager: null,
    providerSnapshotManager: providerSnapshotStub.manager,
    permissions: OWNER_PERMISSIONS,
  } as unknown as SessionOptions;

  return { session: new Session(sessionOptions), messages };
}

async function timeFetchAllPages(
  session: Session,
  messages: SessionOutboundMessage[],
  filter: { includeArchived?: boolean },
): Promise<{ totalMs: number; pageMs: number[]; totalAgents: number }> {
  const pageMs: number[] = [];
  let cursor: string | undefined;
  let totalAgents = 0;
  const start = performance.now();
  let requestId = 0;
  do {
    const before = performance.now();
    messages.length = 0;
    await session.handleMessage({
      type: "fetch_agents_request",
      requestId: `bench-${requestId++}`,
      filter,
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    } as never);
    const after = performance.now();
    pageMs.push(after - before);
    const response = messages.find((m) => m.type === "fetch_agents_response") as
      | { payload: { entries: unknown[]; pageInfo: { nextCursor: string | null } } }
      | undefined;
    if (!response) throw new Error("no fetch_agents_response received");
    totalAgents += response.payload.entries.length;
    cursor = response.payload.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return { totalMs: performance.now() - start, pageMs, totalAgents };
}

test("benchmark: fetch_agents_request at ~1112 on-disk / 427 visible agents", async () => {
  const { workspaces, projects } = buildWorkspacesAndProjects();

  const storedRecords: StoredAgentRecord[] = [];
  for (let i = 0; i < CLOSED_COUNT; i++) {
    storedRecords.push(buildStoredRecord(i, { lastStatus: "closed" }));
  }
  for (let i = 0; i < ARCHIVED_COUNT; i++) {
    storedRecords.push(
      buildStoredRecord(CLOSED_COUNT + i, {
        lastStatus: "closed",
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  }
  const liveAgents = Array.from({ length: IDLE_LIVE_COUNT }, (_, i) => buildManagedAgentLike(i));

  console.log(
    `\nFixture: ${storedRecords.length} stored records (${CLOSED_COUNT} closed, ${ARCHIVED_COUNT} archived), ${liveAgents.length} live idle agents, total-on-disk target ${TOTAL_ON_DISK}`,
  );

  const { session, messages } = buildSession({
    storedRecords,
    liveAgents,
    workspaces,
    projects,
  });

  // Default listing (--global, no -a): excludes archived, paginates via cursor like the CLI.
  const defaultRun = await timeFetchAllPages(session, messages, {});
  console.log(
    `--global (no -a): total ${defaultRun.totalMs.toFixed(1)}ms across ${defaultRun.pageMs.length} pages [${defaultRun.pageMs.map((m) => m.toFixed(1)).join(", ")}]ms, ${defaultRun.totalAgents} agents returned`,
  );

  // -a -g: includeArchived true, walks the full 1112-record population.
  const allRun = await timeFetchAllPages(session, messages, { includeArchived: true });
  console.log(
    `-a -g (includeArchived): total ${allRun.totalMs.toFixed(1)}ms across ${allRun.pageMs.length} pages [${allRun.pageMs.map((m) => m.toFixed(1)).join(", ")}]ms, ${allRun.totalAgents} agents returned`,
  );
});
