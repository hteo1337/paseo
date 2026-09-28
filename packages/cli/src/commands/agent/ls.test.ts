import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";

const daemonTarget = { kind: "endpoint" as const, host: "example.test:12345" };

function createPagingClient() {
  const daemonAgents: AgentSnapshotPayload[] = [3, 2, 1].map((n) => ({
    id: `${n}${n}${n}${n}${n}${n}${n}${n}-0000-4000-8000-000000000000`,
    provider: "codex",
    title: `agent ${n}`,
    status: "closed",
    archivedAt: null,
    cwd: "/tmp/project",
    createdAt: `2026-10-0${n}T00:00:00.000Z`,
    updatedAt: `2026-10-0${n}T00:00:00.000Z`,
    labels: {},
    model: null,
    lastUserMessageAt: null,
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
  }));

  // The fake daemon pages two agents at a time, newest first by the requested key
  // (updated_at by default), and agent 1 is updated right after the first page is served.
  const fetchAgents = async (options?: {
    sort?: { key: string }[];
    page?: { cursor?: string };
  }) => {
    const key: "createdAt" | "updatedAt" =
      options?.sort?.[0]?.key === "created_at" ? "createdAt" : "updatedAt";
    const cursor = options?.page?.cursor;
    const ordered = daemonAgents
      .filter((agent) => cursor === undefined || agent[key] < cursor)
      .sort((left, right) => right[key].localeCompare(left[key]));
    const page = ordered.slice(0, 2);
    const hasMore = ordered.length > 2;
    if (cursor === undefined) {
      daemonAgents[2]!.updatedAt = "2026-10-09T00:00:00.000Z";
    }
    return {
      entries: page.map((agent) => ({ agent })),
      pageInfo: { nextCursor: hasMore ? page[page.length - 1]![key] : null },
    };
  };
  return { fetchAgents, close: async () => {} };
}
import { describe, expect, it, vi } from "vitest";
import { render } from "../../output/index.js";
import { agentLsSchema, buildAgentLsFetchOptions, listAgents, runLsCommand } from "./ls.js";

const snapshot = {
  id: "14780c9d-6c06-4556-91b9-5e5209a1881d",
  title: "Review",
  provider: "codex",
  model: null,
  status: "running",
  cwd: "/tmp/project",
  createdAt: "2026-09-29T00:00:00.000Z",
  updatedAt: "2026-09-29T01:23:45.678Z",
  archivedAt: null,
  labels: {},
};
const client = {
  fetchAgents: vi.fn(async () => ({
    entries: [{ agent: snapshot }],
    pageInfo: { nextCursor: null, hasMore: false },
  })),
  close: vi.fn(async () => undefined),
};

vi.mock("../../utils/client.js", () => ({
  connectToDaemon: vi.fn(async () => client),
}));

describe("buildAgentLsFetchOptions", () => {
  it("fetches active agents by default", () => {
    expect(buildAgentLsFetchOptions({})).toEqual({
      scope: "active",
    });
  });

  it("keeps label and thinking filters within the active scope", () => {
    expect(
      buildAgentLsFetchOptions({
        label: ["surface=workspace"],
        thinking: " medium ",
      }),
    ).toEqual({
      scope: "active",
      filter: {
        labels: { surface: "workspace" },
        thinkingOptionId: "medium",
      },
    });
  });

  it("asks the daemon for internal agents only with --internal", () => {
    expect(buildAgentLsFetchOptions({ background: true, global: true })).toEqual({
      filter: { includeBackground: true },
    });
  });

  it("fetches global non-archived agents for -g", () => {
    expect(buildAgentLsFetchOptions({ global: true })).toEqual({});
  });

  it("includes archived and background agents with -a", () => {
    expect(buildAgentLsFetchOptions({ all: true })).toEqual({
      filter: {
        includeArchived: true,
        includeBackground: true,
      },
    });
  });

  it("fetches all global agents for -a -g", () => {
    expect(buildAgentLsFetchOptions({ all: true, global: true })).toEqual({
      filter: {
        includeArchived: true,
        includeBackground: true,
      },
    });
  });

  it("applies filters to global queries", () => {
    expect(
      buildAgentLsFetchOptions({
        global: true,
        label: ["surface=workspace"],
        thinking: " medium ",
      }),
    ).toEqual({
      filter: {
        labels: { surface: "workspace" },
        thinkingOptionId: "medium",
      },
    });
  });
});

describe("runLsCommand", () => {
  it("lists agents on every page, including one updated during the listing", async () => {
    const result = await listAgents({ daemonTarget, all: true, global: true }, async () =>
      createPagingClient(),
    );

    expect(result.data.map((item) => item.name)).toEqual(["agent 3", "agent 2", "agent 1"]);
  });
});

describe("runLsCommand output", () => {
  it("passes the snapshot updatedAt through JSON without adding a table column", async () => {
    const result = await runLsCommand(
      { daemonTarget: { kind: "endpoint", host: "example.test:12345" } },
      {} as never,
    );

    expect(result.data[0]?.updatedAt).toBe(snapshot.updatedAt);
    expect(JSON.parse(render(result, { format: "json" }))).toMatchObject([
      { id: snapshot.id, updatedAt: snapshot.updatedAt },
    ]);
    expect(agentLsSchema.columns.map((column) => column.header)).toEqual([
      "AGENT ID",
      "NAME",
      "PROVIDER",
      "THINKING",
      "STATUS",
      "CWD",
      "CREATED",
    ]);
    expect(render(result, { format: "table", noColor: true })).toBe(
      render(
        { ...result, data: [{ ...result.data[0]!, updatedAt: "different" }] },
        { format: "table", noColor: true },
      ),
    );
  });
});
