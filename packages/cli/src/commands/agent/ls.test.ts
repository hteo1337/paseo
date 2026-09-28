import { describe, expect, it, vi } from "vitest";
import { render } from "../../output/index.js";
import { agentLsSchema, buildAgentLsFetchOptions, runLsCommand } from "./ls.js";

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

  it("fetches global non-archived agents for -g", () => {
    expect(buildAgentLsFetchOptions({ global: true })).toEqual({});
  });

  it("keeps -a within the active scope", () => {
    expect(buildAgentLsFetchOptions({ all: true })).toEqual({
      scope: "active",
      filter: {
        includeArchived: true,
      },
    });
  });

  it("fetches all global agents for -a -g", () => {
    expect(buildAgentLsFetchOptions({ all: true, global: true })).toEqual({
      filter: {
        includeArchived: true,
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
