import { Command } from "commander";
import {
  ProjectGroupAssignmentSchema,
  ProjectGroupRuleInputSchema,
  type ProjectGroupOperation,
} from "@getpaseo/protocol/project-groups";
import { withOutput, type CommandOptions, type ListResult } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { connectToDaemon } from "../../utils/client.js";

interface GroupRow {
  name: string;
  order: number;
  collapsed: boolean;
  projects: number;
  rules: import("@getpaseo/protocol/project-groups").ProjectGroupRule[];
}
interface GroupOptions extends CommandOptions {
  order?: string;
  collapsed?: boolean;
  expanded?: boolean;
  path?: string;
  owner?: string;
  repoPrefix?: string;
}

async function runGroupOperation(
  operation: ProjectGroupOperation,
  options: GroupOptions,
): Promise<ListResult<GroupRow>> {
  const client = await connectToDaemon({ target: options.daemonTarget });
  try {
    if (options.expanded && options.collapsed) throw new Error("Choose --collapsed or --expanded");
    const payload = await client.projectGroup(operation);
    const counts = new Map<string, number>();
    const page = await client.listProjects();
    for (const project of page.projects)
      if (project.projectGroup)
        counts.set(project.projectGroup.name, (counts.get(project.projectGroup.name) ?? 0) + 1);
    return {
      type: "list",
      data: payload.groups.map((group) => ({
        name: group.name,
        order: group.order,
        collapsed: group.collapsed,
        projects: counts.get(group.name) ?? 0,
        rules: payload.rules.filter((rule) => rule.group.name === group.name),
      })),
      schema: {
        idField: "name",
        columns: [
          { header: "GROUP", field: "name", width: 28 },
          { header: "ORDER", field: "order", width: 8 },
          { header: "COLLAPSED", field: "collapsed", width: 12 },
          { header: "PROJECTS", field: "projects", width: 10 },
        ],
      },
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function groupMetadata(name: string, options: GroupOptions) {
  return ProjectGroupAssignmentSchema.parse({
    name,
    order: options.order === undefined ? undefined : Number(options.order),
    collapsed: options.expanded ? false : options.collapsed,
  });
}

export function createProjectGroupCommand(): Command {
  const group = new Command("group").description(
    "Group projects and configure automatic placement",
  );
  addJsonAndDaemonHostOptions(
    group.command("ls").description("List groups and rules (rules included in JSON)"),
  ).action(
    withOutput((options: GroupOptions, _command: Command) =>
      runGroupOperation({ kind: "list" }, options),
    ),
  );
  addJsonAndDaemonHostOptions(
    group
      .command("set")
      .argument("<project-id>")
      .argument("<name>")
      .option("--order <number>", "Group order (defaults to existing group order)")
      .option("--collapsed", "Collapsed by default on new clients")
      .option("--expanded", "Expanded by default on new clients")
      .allowExcessArguments(false),
  ).action(
    withOutput((projectId: string, name: string, options: GroupOptions, _command: Command) =>
      runGroupOperation({ kind: "set", projectId, group: groupMetadata(name, options) }, options),
    ),
  );
  addJsonAndDaemonHostOptions(
    group
      .command("unset")
      .argument("<project-id>")
      .description("Leave this project ungrouped, overriding automatic rules")
      .allowExcessArguments(false),
  ).action(
    withOutput((projectId: string, options: GroupOptions, _command: Command) =>
      runGroupOperation({ kind: "unset", projectId }, options),
    ),
  );
  const ruleCommand = group
    .command("rule")
    .description("First matching rule wins; explicit set/unset wins over rules");
  addJsonAndDaemonHostOptions(
    ruleCommand
      .command("add")
      .argument("<id>")
      .argument("<group>")
      .option("--path <prefix>", "Daemon-side path prefix (supports ~/ and trailing /**)")
      .option("--owner <owner>", "Origin remote owner, e.g. BlackHubTechnologies")
      .option(
        "--repo-prefix <prefix>",
        "Repository prefix in the canonical origin identity, e.g. bf-",
      )
      .option("--order <number>", "Group order (defaults to existing group order)")
      .option("--collapsed", "Collapsed by default")
      .option("--expanded", "Expanded by default")
      .allowExcessArguments(false),
  ).action(
    withOutput((id: string, name: string, options: GroupOptions, _command: Command) => {
      if (
        (options.path && (options.owner || options.repoPrefix)) ||
        (!options.path && !options.owner && !options.repoPrefix)
      )
        throw new Error("Choose --path, --owner, or --repo-prefix (with optional --owner)");
      let match: unknown = { kind: "remote_owner", owner: options.owner };
      if (options.repoPrefix)
        match = { kind: "remote_repository", prefix: options.repoPrefix, owner: options.owner };
      if (options.path) match = { kind: "path", prefix: options.path };
      const rule = ProjectGroupRuleInputSchema.parse({
        id,
        group: groupMetadata(name, options),
        match,
      });
      return runGroupOperation({ kind: "rule_add", rule }, options);
    }),
  );
  addJsonAndDaemonHostOptions(
    ruleCommand.command("rm").argument("<id>").allowExcessArguments(false),
  ).action(
    withOutput((id: string, options: GroupOptions, _command: Command) =>
      runGroupOperation({ kind: "rule_remove", id }, options),
    ),
  );
  return group;
}
