import type { ProjectGroup } from "@getpaseo/protocol/project-groups";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";

export interface ProjectGroupSection {
  key: string;
  name: string;
  order: number;
  collapsed: boolean;
  projects: SidebarProjectEntry[];
  workspaceCount: number;
  attentionCount: number;
}

export function isScratchWorkspace(directory: string): boolean {
  const normalized = directory.replaceAll("\\", "/");
  return (
    /^\/(?:private\/)?(?:tmp|var\/folders)(?:\/|$)/u.test(normalized) ||
    /\/(?:ops-scratch|cache\/scratch|Paseo\/(?:Sandbox|Scratch))(?:\/|$)/u.test(normalized)
  );
}

export function buildProjectGroupTree(input: {
  projects: readonly SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  collapseOverrides?: Readonly<Record<string, boolean>>;
}): ProjectGroupSection[] {
  const groups = new Map<string, ProjectGroupSection>();
  function add(project: SidebarProjectEntry, scratch: boolean, metadata?: ProjectGroup | null) {
    let key = "ungrouped";
    if (metadata) key = JSON.stringify(["group", metadata.name]);
    if (scratch) key = "scratch";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: scratch ? "Scratch" : (metadata?.name ?? "Ungrouped"),
        order: scratch ? Number.MAX_SAFE_INTEGER : (metadata?.order ?? Number.MAX_SAFE_INTEGER - 1),
        collapsed: input.collapseOverrides?.[key] ?? (scratch || (metadata?.collapsed ?? false)),
        projects: [],
        workspaceCount: 0,
        attentionCount: 0,
      };
      groups.set(key, group);
    }
    group.projects.push(project);
    group.workspaceCount += project.workspaces.length;
    group.attentionCount += project.workspaces.filter((workspace) => {
      const status = input.workspaceEntriesByKey.get(workspace.workspaceKey)?.statusBucket;
      return status === "needs_input" || status === "failed" || status === "attention";
    }).length;
  }
  for (const project of input.projects) {
    const partitions = new Map<
      string,
      {
        metadata: ProjectGroup | null | undefined;
        scratch: boolean;
        workspaces: SidebarProjectEntry["workspaces"];
        hosts: SidebarProjectEntry["hosts"];
      }
    >();
    function partition(metadata: ProjectGroup | null | undefined, scratch: boolean) {
      const key = scratch ? "scratch" : JSON.stringify(metadata?.name ?? null);
      let part = partitions.get(key);
      if (!part) {
        part = { metadata: scratch ? null : metadata, scratch, workspaces: [], hosts: [] };
        partitions.set(key, part);
      }
      return part;
    }
    for (const workspace of project.workspaces) {
      const host = project.hosts.find((entry) => entry.serverId === workspace.serverId);
      let metadata = project.projectGroup;
      if (host?.projectGroup !== undefined) metadata = host.projectGroup;
      if (workspace.projectGroup !== undefined) metadata = workspace.projectGroup;
      const scratch = isScratchWorkspace(
        input.workspaceEntriesByKey.get(workspace.workspaceKey)?.workspaceDirectory ||
          project.iconWorkingDir,
      );
      const part = partition(metadata, scratch);
      part.workspaces.push(workspace);
      if (host && !part.hosts.includes(host)) part.hosts.push(host);
    }
    // Empty or fully pinned host placements retain their project and creation/settings target.
    for (const host of project.hosts) {
      if ([...partitions.values()].some((part) => part.hosts.includes(host))) continue;
      const metadata = host.projectGroup !== undefined ? host.projectGroup : project.projectGroup;
      partition(metadata, isScratchWorkspace(host.iconWorkingDir)).hosts.push(host);
    }
    if (!project.workspaces.length && !project.hosts.length)
      partition(project.projectGroup, isScratchWorkspace(project.iconWorkingDir));
    for (const part of partitions.values()) {
      add(
        {
          ...project,
          projectGroup: part.metadata,
          workspaces: part.workspaces,
          hosts: part.hosts,
          iconWorkingDir: part.hosts[0]?.iconWorkingDir ?? project.iconWorkingDir,
        },
        part.scratch,
        part.metadata,
      );
    }
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function liveWorkspaceKeys(
  input: readonly {
    serverId: string;
    agents: Iterable<
      Pick<import("@/stores/session-store").Agent, "status" | "archivedAt" | "workspaceId">
    >;
  }[],
): Set<string> {
  const keys = new Set<string>();
  for (const session of input)
    for (const agent of session.agents) {
      if (
        !agent.archivedAt &&
        agent.workspaceId &&
        (agent.status === "running" || agent.status === "idle" || agent.status === "initializing")
      )
        keys.add(`${session.serverId}:${agent.workspaceId}`);
    }
  return keys;
}
