import { z } from "zod";

export const ProjectGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().default(0),
  collapsed: z.boolean().default(false),
});
export type ProjectGroup = z.infer<typeof ProjectGroupSchema>;

export const ProjectGroupAssignmentSchema = ProjectGroupSchema.extend({
  order: z.number().int().optional(),
  collapsed: z.boolean().optional(),
});
export type ProjectGroupAssignment = z.infer<typeof ProjectGroupAssignmentSchema>;

export const ProjectGroupRuleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  group: ProjectGroupSchema,
  match: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("path"), prefix: z.string().trim().min(1) }),
    z.object({ kind: z.literal("remote_owner"), owner: z.string().trim().min(1) }),
    z.object({
      kind: z.literal("remote_repository"),
      prefix: z.string().trim().min(1),
      owner: z.string().trim().min(1).optional(),
    }),
  ]),
});
export type ProjectGroupRule = z.infer<typeof ProjectGroupRuleSchema>;

export const ProjectGroupingConfigSchema = z.object({
  groups: z.array(ProjectGroupSchema).optional(),
  rules: z.array(ProjectGroupRuleSchema).default([]),
});

export const ProjectGroupRuleInputSchema = ProjectGroupRuleSchema.extend({
  group: ProjectGroupAssignmentSchema,
});

export const ProjectGroupOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("list") }),
  z.object({ kind: z.literal("set"), projectId: z.string(), group: ProjectGroupAssignmentSchema }),
  z.object({ kind: z.literal("unset"), projectId: z.string() }),
  z.object({ kind: z.literal("rule_add"), rule: ProjectGroupRuleInputSchema }),
  z.object({ kind: z.literal("rule_remove"), id: z.string() }),
]);
export type ProjectGroupOperation = z.infer<typeof ProjectGroupOperationSchema>;

export const INITIAL_PROJECT_GROUPS: ProjectGroup[] = [
  { name: "BlackForge", order: 0, collapsed: false },
  { name: "Nexus Platform", order: 1, collapsed: false },
  { name: "Fleet tooling", order: 2, collapsed: false },
];
