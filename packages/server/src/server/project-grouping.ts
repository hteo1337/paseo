import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  INITIAL_PROJECT_GROUPS,
  ProjectGroupSchema,
  type ProjectGroupAssignment,
  type ProjectGroup,
  type ProjectGroupOperation,
  type ProjectGroupRule,
} from "@getpaseo/protocol/project-groups";
import { loadPersistedConfig, savePersistedConfig } from "./persisted-config.js";
import type { PersistedProjectRecord, ProjectRegistry } from "./workspace-registry.js";

function expandedPrefix(prefix: string, home: string): string {
  return resolve(prefix.replace(/\/\*\*$/u, "").replace(/^~(?=\/|$)/u, home));
}

/** Rules are first-match, path-boundary aware, and independent of checkout folder names. */
export function resolveProjectGroup(input: {
  project: Pick<PersistedProjectRecord, "rootPath" | "projectKey">;
  rules: readonly ProjectGroupRule[];
  home?: string;
}): ProjectGroup | null {
  for (const rule of input.rules) {
    if (rule.match.kind === "path") {
      const offset = relative(
        expandedPrefix(rule.match.prefix, input.home ?? homedir()),
        resolve(input.project.rootPath),
      );
      if (
        offset === "" ||
        (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))
      )
        return rule.group;
    } else {
      // projectKey is the canonical remote identity already produced by TH1-630.
      const owner = input.project.projectKey?.match(/^remote:[^/]+\/([^/]+)\//u)?.[1];
      if (rule.match.kind === "remote_owner") {
        if (owner?.toLowerCase() === rule.match.owner.replace(/\/\*$/u, "").toLowerCase())
          return rule.group;
      } else {
        const repository = input.project.projectKey?.split("#")[0].split("/").at(-1);
        if (
          owner &&
          repository?.toLowerCase().startsWith(rule.match.prefix.toLowerCase()) &&
          (!rule.match.owner || owner.toLowerCase() === rule.match.owner.toLowerCase())
        )
          return rule.group;
      }
    }
  }
  return null;
}

export function applyProjectGroupRules(
  record: PersistedProjectRecord,
  paseoHome: string,
): PersistedProjectRecord {
  const config = loadPersistedConfig(paseoHome).projectGrouping;
  const canonical = (group: ProjectGroup | null | undefined) =>
    group && (config?.groups?.find((entry) => entry.name === group.name) ?? group);
  if (record.groupSource === "manual")
    return record.group ? { ...record, group: canonical(record.group) } : record;
  const rules = config?.rules ?? [];
  const group = canonical(resolveProjectGroup({ project: record, rules }));
  if (!group && record.groupSource !== "rule") return record;
  return { ...record, group, groupSource: "rule" };
}

/** Only the reviewed stopgap's exact id/root/prefix may be converted. */
export async function migrateProjectGroupPrefixes(input: {
  projects: ProjectRegistry;
  mapping: string;
}): Promise<string[]> {
  const lines = input.mapping
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.split("\t"));
  const headers = lines.shift() ?? [];
  const field = (row: string[], name: string) => row[headers.indexOf(name)] ?? "";
  const migrated: string[] = [];
  for (const row of lines) {
    const group = INITIAL_PROJECT_GROUPS.find((entry) => entry.name === field(row, "group"));
    if (!group || field(row, "action") !== "rename") continue;
    const projectId = field(row, "project_id");
    const project = await input.projects.get(projectId);
    if (!project || project.archivedAt || project.groupSource === "manual") continue;
    const roots = await Promise.all([
      fs.realpath(project.rootPath),
      fs.realpath(field(row, "path")),
    ]).catch(() => null);
    if (!roots || roots[0] !== roots[1]) continue;
    const prefix = `${group.name} / `;
    const current = project.customName ?? project.displayName;
    if (!current.startsWith(prefix) || !current.slice(prefix.length).trim()) continue;
    const updated = await input.projects.update(projectId, (record) => {
      if (
        (record.customName ?? record.displayName) !== current ||
        record.archivedAt ||
        record.rootPath !== project.rootPath
      )
        return record;
      return {
        ...record,
        customName: record.customName === null ? null : current.slice(prefix.length),
        displayName: record.customName === null ? current.slice(prefix.length) : record.displayName,
        // Teo 2026-10-11: bf-* platform repositories moved from the stopgap's BlackForge to Nexus Platform.
        group: /^remote:[^/]+\/(?:[^/]+\/)*bf-[^/#]+(?:#|$)/u.test(record.projectKey ?? "")
          ? INITIAL_PROJECT_GROUPS[1]
          : group,
        groupSource: "manual",
        updatedAt: new Date().toISOString(),
      };
    });
    if (
      updated?.group &&
      (updated.customName ?? updated.displayName) === current.slice(prefix.length)
    )
      migrated.push(projectId);
  }
  return migrated;
}

export async function initializeProjectGrouping(
  projects: ProjectRegistry,
  paseoHome: string,
): Promise<void> {
  const mappingPath = join(paseoHome, "ops-scratch", "ws-clean", "grouping.tsv");
  const mapping = await fs.readFile(mappingPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (mapping !== null) await migrateProjectGroupPrefixes({ projects, mapping });
  for (const record of await projects.list()) {
    if (record.archivedAt) continue;
    const next = applyProjectGroupRules(record, paseoHome);
    if (JSON.stringify(next.group) !== JSON.stringify(record.group))
      await projects.update(record.projectId, (current) =>
        applyProjectGroupRules(current, paseoHome),
      );
  }
}

const queues = new WeakMap<ProjectRegistry, Promise<void>>();

export async function projectGroupOperation(input: {
  projects: ProjectRegistry;
  paseoHome: string;
  operation: ProjectGroupOperation;
}): Promise<{
  groups: ProjectGroup[];
  rules: ProjectGroupRule[];
  changedProjects: PersistedProjectRecord[];
}> {
  const previous = queues.get(input.projects) ?? Promise.resolve();
  let release!: () => void;
  const queued = new Promise<void>((done) => {
    release = done;
  });
  queues.set(input.projects, queued);
  await previous;
  try {
    const { operation, projects, paseoHome } = input;
    const before = new Map(
      (await projects.list()).map((record) => [record.projectId, JSON.stringify(record.group)]),
    );
    if (operation.kind === "set" || operation.kind === "unset") {
      await updateProjectGroupAssignment(projects, paseoHome, operation);
    } else if (operation.kind === "rule_add" || operation.kind === "rule_remove") {
      await updateProjectGroupRules({ projects, paseoHome, operation });
    }
    const groups = new Map(INITIAL_PROJECT_GROUPS.map((group) => [group.name, group]));
    const rules = loadPersistedConfig(paseoHome).projectGrouping?.rules ?? [];
    for (const rule of rules) groups.set(rule.group.name, rule.group);
    const records = await projects.list();
    for (const record of records)
      if (!record.archivedAt && record.group) groups.set(record.group.name, record.group);
    for (const group of loadPersistedConfig(paseoHome).projectGrouping?.groups ?? [])
      groups.set(group.name, group);
    return {
      groups: [...groups.values()].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name),
      ),
      rules,
      changedProjects: records.filter(
        (record) =>
          !record.archivedAt && before.get(record.projectId) !== JSON.stringify(record.group),
      ),
    };
  } finally {
    release();
    if (queues.get(input.projects) === queued) queues.delete(input.projects);
  }
}

async function updateProjectGroupAssignment(
  projects: ProjectRegistry,
  paseoHome: string,
  operation: Extract<ProjectGroupOperation, { kind: "set" | "unset" }>,
): Promise<void> {
  const existing = await projects.get(operation.projectId);
  if (!existing || existing.archivedAt) throw new Error("Project not found or archived");
  const group =
    operation.kind === "set"
      ? await resolveGroupMetadata(projects, paseoHome, operation.group)
      : null;
  if (group) await setGroupMetadata(projects, paseoHome, group);
  const updated = await projects.update(operation.projectId, (record) => {
    if (record.archivedAt) throw new Error("Project is archived");
    return {
      ...record,
      group,
      groupSource: "manual",
      updatedAt: new Date().toISOString(),
    };
  });
  if (!updated) throw new Error("Project not found");
}

async function updateProjectGroupRules(input: {
  projects: ProjectRegistry;
  paseoHome: string;
  operation: Extract<ProjectGroupOperation, { kind: "rule_add" | "rule_remove" }>;
}): Promise<void> {
  const { projects, paseoHome, operation } = input;
  let config = loadPersistedConfig(paseoHome);
  const rules = config.projectGrouping?.rules ?? [];
  if (operation.kind === "rule_add" && rules.some((rule) => rule.id === operation.rule.id))
    throw new Error("Rule id already exists; remove it first");
  if (operation.kind === "rule_remove" && !rules.some((rule) => rule.id === operation.id))
    throw new Error("Rule not found");
  const rule =
    operation.kind === "rule_add"
      ? {
          ...operation.rule,
          group: await resolveGroupMetadata(projects, paseoHome, operation.rule.group),
        }
      : null;
  if (rule) {
    await setGroupMetadata(projects, paseoHome, rule.group);
    config = loadPersistedConfig(paseoHome);
  }
  const configuredRules = config.projectGrouping?.rules ?? [];
  const next =
    operation.kind === "rule_remove"
      ? configuredRules.filter((entry) => entry.id !== operation.id)
      : [...configuredRules, rule!];
  savePersistedConfig(paseoHome, {
    ...config,
    projectGrouping: { ...config.projectGrouping, rules: next },
  });
  // Reading current records inside update preserves concurrent rename/icon changes.
  for (const record of await projects.list()) {
    if (record.archivedAt || record.groupSource === "manual") continue;
    const grouped = applyProjectGroupRules(record, paseoHome);
    if (JSON.stringify(grouped.group) !== JSON.stringify(record.group))
      await projects.update(record.projectId, (current) =>
        applyProjectGroupRules(current, paseoHome),
      );
  }
}

/** Called inside the registry's group-operation queue; omitted fields inherit the latest defaults. */
async function resolveGroupMetadata(
  projects: ProjectRegistry,
  paseoHome: string,
  assignment: ProjectGroupAssignment,
): Promise<ProjectGroup> {
  const config = loadPersistedConfig(paseoHome).projectGrouping;
  const existing =
    config?.groups?.find((group) => group.name === assignment.name) ??
    config?.rules.find((rule) => rule.group.name === assignment.name)?.group ??
    (await projects.list()).find(
      (record) => !record.archivedAt && record.group?.name === assignment.name,
    )?.group ??
    INITIAL_PROJECT_GROUPS.find((group) => group.name === assignment.name);
  return ProjectGroupSchema.parse({
    name: assignment.name,
    order: assignment.order ?? existing?.order,
    collapsed: assignment.collapsed ?? existing?.collapsed,
  });
}

async function setGroupMetadata(
  projects: ProjectRegistry,
  paseoHome: string,
  group: ProjectGroup,
): Promise<void> {
  const config = loadPersistedConfig(paseoHome);
  const groups = config.projectGrouping?.groups ?? [];
  const rules = config.projectGrouping?.rules ?? [];
  savePersistedConfig(paseoHome, {
    ...config,
    projectGrouping: {
      groups: [...groups.filter((entry) => entry.name !== group.name), group],
      rules: rules.map((rule) => ({
        id: rule.id,
        match: rule.match,
        group: rule.group.name === group.name ? group : rule.group,
      })),
    },
  });
  for (const record of await projects.list()) {
    if (
      record.archivedAt ||
      record.group?.name !== group.name ||
      JSON.stringify(record.group) === JSON.stringify(group)
    )
      continue;
    await projects.update(record.projectId, (current) =>
      current.group?.name === group.name ? { ...current, group } : current,
    );
  }
}

export function projectGroupMetadata(record: PersistedProjectRecord | null | undefined) {
  return record?.group ? { projectGroup: record.group } : {};
}
