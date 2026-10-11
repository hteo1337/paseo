import { buildProjectGroupTree, liveWorkspaceKeys, isScratchWorkspace } from "./project-group-tree";
import { i18n } from "@/i18n/i18next";
import { describe, expect, it } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { buildSidebarProjection } from "./sidebar-projection";

function makeWorkspace(
  id: string,
  statusBucket: SidebarWorkspaceEntry["statusBucket"] = "done",
  labels: string[] = [],
  projectViewKey = "project",
) {
  const placement: SidebarWorkspacePlacement = {
    workspaceKey: `srv:${id}`,
    serverId: "srv",
    workspaceId: id,
    projectViewKey,
    projectName: "Project",
    projectKind: "git",
    workspaceKind: "worktree",
    name: id,
  };
  const entry: SidebarWorkspaceEntry = {
    ...placement,
    workspaceDirectory: "",
    workspaceDirectoryLabel: "",
    title: null,
    currentBranch: null,
    statusBucket,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    labels,
  };
  return { placement, entry };
}

function makeProject(
  workspaces: SidebarWorkspacePlacement[],
  viewKey = "project",
): SidebarProjectEntry {
  return {
    viewKey,
    projectName: "Project",
    projectKind: "git",
    iconWorkingDir: `/repo/${viewKey}`,
    hosts: [
      {
        serverId: "srv",
        projectId: viewKey,
        iconWorkingDir: `/repo/${viewKey}`,
        worktreeSupport: "supported" as const,
      },
    ],
    workspaces,
  };
}

function projectionInput(options?: {
  groupMode?: "project" | "status";
  pinnedCollapsed?: boolean;
}) {
  const pinned = makeWorkspace("pinned", "running");
  const unpinned = makeWorkspace("unpinned", "needs_input");
  return {
    projects: [makeProject([pinned.placement, unpinned.placement])],
    pinnedKeys: {
      pinnedWorkspaceKeys: [pinned.placement.workspaceKey],
      pinnedAtByKey: { [pinned.placement.workspaceKey]: "2026-07-12T12:00:00.000Z" },
    },
    pinnedWorkspaceOrder: [],
    workspaceEntriesByKey: new Map([
      [pinned.entry.workspaceKey, pinned.entry],
      [unpinned.entry.workspaceKey, unpinned.entry],
    ]),
    projectNamesByViewKey: new Map([["project", "Project"]]),
    groupMode: options?.groupMode ?? ("project" as const),
    pinnedCollapsed: options?.pinnedCollapsed ?? false,
    collapsedProjectKeys: new Set<string>(),
    collapsedWorkspaceGroupKeys: new Set<string>(),
    t: i18n.t,
  };
}

/**
 * Two projects, one workspace each, both labelled — so every grouping mode puts rows from more
 * than one project on screen, and a mode that asked for fewer icons than it renders would show it.
 */
function twoProjectInput(groupMode: "project" | "status") {
  const first = makeWorkspace("first", "running", ["Urgent"], "project");
  const second = makeWorkspace("second", "needs_input", ["Backend"], "other-project");
  return {
    ...projectionInput({ groupMode }),
    projects: [makeProject([first.placement]), makeProject([second.placement], "other-project")],
    pinnedKeys: { pinnedWorkspaceKeys: [], pinnedAtByKey: {} },
    workspaceEntriesByKey: new Map([
      [first.entry.workspaceKey, first.entry],
      [second.entry.workspaceKey, second.entry],
    ]),
    projectNamesByViewKey: new Map([
      ["project", "Project"],
      ["other-project", "Other project"],
    ]),
  };
}

describe("buildSidebarProjection", () => {
  // The rule that outlived the bug it was written for: a project icon is fetched per project, so
  // whatever a mode groups by, the rows it produces can only reference projects already covered.
  for (const groupMode of ["project", "status"] as const) {
    it(`covers every row ${groupMode} grouping renders with a project icon target`, () => {
      const projection = buildSidebarProjection(twoProjectInput(groupMode));
      const covered = new Set(projection.projectIconTargets.map((target) => target.projectViewKey));

      // Every leading visual the sidebar can paint from this projection: pinned rows, grouped
      // rows, project headers and the rows under them.
      const renderedProjectViewKeys = new Set<string>();
      for (const entry of projection.pinnedGroups.pinnedChats) {
        renderedProjectViewKeys.add(entry.projectViewKey);
      }
      for (const group of projection.workspaceGroups) {
        for (const entry of group.rows) renderedProjectViewKeys.add(entry.projectViewKey);
      }
      for (const project of projection.pinnedGroups.unpinnedProjects) {
        renderedProjectViewKeys.add(project.viewKey);
        for (const entry of project.workspaces) renderedProjectViewKeys.add(entry.projectViewKey);
      }

      expect([...renderedProjectViewKeys].sort()).toEqual(["other-project", "project"]);
      expect([...renderedProjectViewKeys].filter((viewKey) => !covered.has(viewKey))).toEqual([]);
    });
  }

  it("uses one pin-aware projection for project rows and shortcut order", () => {
    const projection = buildSidebarProjection(projectionInput());

    expect(projection.pinnedGroups.pinnedChats.map((entry) => entry.workspaceId)).toEqual([
      "pinned",
    ]);
    const remainingProject = projection.pinnedGroups.unpinnedProjects[0];
    expect(remainingProject?.workspaces.map((entry) => entry.workspaceId)).toEqual(["unpinned"]);
    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "pinned" },
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("keeps pinned chats above status groups and removes them from those groups", () => {
    const projection = buildSidebarProjection(projectionInput({ groupMode: "status" }));

    expect(projection.workspaceGroups.map((group) => group.key)).toEqual(["needs_input"]);
    expect(projection.workspaceGroups[0]?.rows.map((entry) => entry.workspaceId)).toEqual([
      "unpinned",
    ]);
    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "pinned" },
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("does not number pinned chats while the pinned section is collapsed", () => {
    const projection = buildSidebarProjection(
      projectionInput({ groupMode: "status", pinnedCollapsed: true }),
    );

    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });
});

describe("project group tree", () => {
  it("projects groups/workspaces, rolls counts and attention up, and applies per-client collapse overrides", () => {
    const input = twoProjectInput("project");
    input.projects[0].projectGroup = { name: "Nexus Platform", order: 1, collapsed: false };
    input.projects[1].projectGroup = { name: "Fleet tooling", order: 2, collapsed: true };
    const groups = buildProjectGroupTree(input);
    expect(
      groups.map(({ name, workspaceCount, attentionCount, collapsed }) => ({
        name,
        workspaceCount,
        attentionCount,
        collapsed,
      })),
    ).toEqual([
      { name: "Nexus Platform", workspaceCount: 1, attentionCount: 0, collapsed: false },
      { name: "Fleet tooling", workspaceCount: 1, attentionCount: 1, collapsed: true },
    ]);
    const overrideKey = groups[1].key;
    const local = buildProjectGroupTree({ ...input, collapseOverrides: { [overrideKey]: false } });
    expect(local[1].collapsed).toBe(false);
    expect(groups[1].collapsed).toBe(true);
    expect(buildSidebarProjection(input).shortcutModel.shortcutTargets).not.toEqual(
      buildSidebarProjection({ ...input, groupCollapseOverrides: { [overrideKey]: false } })
        .shortcutModel.shortcutTargets,
    );
  });
  it("splits temporary workspaces into collapsed Scratch and keeps ungrouped and non-temporary workspaces visible", () => {
    const active = makeWorkspace("main", "needs_input");
    const scratch = makeWorkspace("review", "attention");
    active.entry.workspaceDirectory = "/work/repo";
    scratch.entry.workspaceDirectory = "/Users/teo/.paseo/ops-scratch/grouping";
    const groups = buildProjectGroupTree({
      projects: [makeProject([active.placement, scratch.placement])],
      workspaceEntriesByKey: new Map([
        [active.entry.workspaceKey, active.entry],
        [scratch.entry.workspaceKey, scratch.entry],
      ]),
    });
    expect(
      groups.map(({ name, workspaceCount, attentionCount, collapsed }) => ({
        name,
        workspaceCount,
        attentionCount,
        collapsed,
      })),
    ).toEqual([
      { name: "Ungrouped", workspaceCount: 1, attentionCount: 1, collapsed: false },
      { name: "Scratch", workspaceCount: 1, attentionCount: 1, collapsed: true },
    ]);
    expect(groups[0].projects[0].workspaces[0].workspaceId).toBe("main");
    expect(groups[1].projects[0].workspaces[0].workspaceId).toBe("review");
    expect(isScratchWorkspace("/tmp/review")).toBe(true);
    expect(isScratchWorkspace("/work/tmp/review")).toBe(false);
    expect(isScratchWorkspace("/work/ops-scratch-other")).toBe(false);
  });
  it("live filter retains idle/running/initializing agents and excludes archived/closed/error agents", () => {
    const keys = liveWorkspaceKeys([
      {
        serverId: "srv",
        agents: [
          { workspaceId: "idle", status: "idle", archivedAt: null },
          { workspaceId: "running", status: "running", archivedAt: null },
          { workspaceId: "starting", status: "initializing", archivedAt: null },
          { workspaceId: "closed", status: "closed", archivedAt: null },
          { workspaceId: "error", status: "error", archivedAt: null },
          { workspaceId: "archived", status: "running", archivedAt: new Date(0) },
        ],
      },
    ]);
    expect([...keys]).toEqual(["srv:idle", "srv:running", "srv:starting"]);
  });
});

it("places equivalent repositories under each host's group without changing preference keys", () => {
  const a = makeWorkspace("a");
  const b = makeWorkspace("b");
  b.placement.serverId = "other";
  const project = makeProject([a.placement, b.placement]);
  const group = (name: string) => ({ name, order: 1, collapsed: false });
  project.hosts = [
    {
      serverId: "srv",
      projectId: "a",
      iconWorkingDir: "/a",
      worktreeSupport: "supported",
      projectGroup: group("Nexus Platform"),
    },
    {
      serverId: "other",
      projectId: "b",
      iconWorkingDir: "/b",
      worktreeSupport: "supported",
      projectGroup: group("Fleet tooling"),
    },
  ];
  const build = () =>
    buildProjectGroupTree({ projects: [project], workspaceEntriesByKey: new Map() });
  expect(
    build().map((section) => [
      section.name,
      section.projects[0].viewKey,
      section.projects[0].workspaces.map((ws) => ws.workspaceId),
    ]),
  ).toEqual([
    ["Fleet tooling", "project", ["b"]],
    ["Nexus Platform", "project", ["a"]],
  ]);
  expect(build().map((section) => section.projects[0].hosts.length)).toEqual([1, 1]);
  project.hosts[0].projectGroup = null;
  expect(
    build().map((section) => [
      section.name,
      section.projects[0].workspaces.map((ws) => ws.workspaceId),
    ]),
  ).toEqual([
    ["Fleet tooling", ["b"]],
    ["Ungrouped", ["a"]],
  ]);
});

it("retains empty or fully pinned host placements beside occupied equivalent repositories", () => {
  const a = makeWorkspace("a");
  const project = makeProject([a.placement]);
  project.hosts = [
    {
      serverId: "srv",
      projectId: "a",
      iconWorkingDir: "/a",
      worktreeSupport: "supported",
      projectGroup: { name: "Nexus Platform", order: 1, collapsed: false },
    },
    {
      serverId: "empty",
      projectId: "b",
      iconWorkingDir: "/b",
      worktreeSupport: "supported",
      projectGroup: { name: "Fleet tooling", order: 2, collapsed: false },
    },
  ];
  const groups = buildProjectGroupTree({ projects: [project], workspaceEntriesByKey: new Map() });
  expect(groups.map((group) => [group.name, group.workspaceCount])).toEqual([
    ["Nexus Platform", 1],
    ["Fleet tooling", 0],
  ]);
  expect(groups[1].projects[0].hosts.map((host) => host.serverId)).toEqual(["empty"]);
  expect(groups[1].projects[0].viewKey).toBe("project");
  const b = makeWorkspace("b");
  b.placement.serverId = "empty";
  project.workspaces.push(b.placement);
  const projection = buildSidebarProjection({
    ...projectionInput(),
    projects: [project],
    pinnedKeys: { pinnedWorkspaceKeys: [b.placement.workspaceKey], pinnedAtByKey: {} },
    workspaceEntriesByKey: new Map([
      [a.entry.workspaceKey, a.entry],
      [b.entry.workspaceKey, b.entry],
    ]),
  });
  const unpinnedTree = buildProjectGroupTree({
    projects: projection.pinnedGroups.unpinnedProjects,
    workspaceEntriesByKey: new Map(),
  });
  expect(
    unpinnedTree.find((group) => group.name === "Fleet tooling")?.projects[0].hosts[0].serverId,
  ).toBe("empty");
});
