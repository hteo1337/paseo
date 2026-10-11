import type { Command } from "commander";
import type { CommandError, CommandOptions, SingleResult } from "../../output/index.js";
import { buildDaemonConnectionCommandError, connectToDaemon } from "../../utils/client.js";

interface ProjectDeleteResult {
  projectId: string;
  removedWorkspaceIds: string[];
}

const projectDeleteSchema = {
  idField: "projectId" as const,
  columns: [
    { header: "PROJECT ID", field: "projectId" as const, width: 20 },
    {
      header: "REMOVED WORKSPACES",
      field: (result: ProjectDeleteResult) => result.removedWorkspaceIds.length,
      width: 18,
    },
  ],
};

export async function runDeleteCommand(
  projectId: string,
  options: CommandOptions & { ifEmpty?: boolean; ifNoActiveWorkspaces?: boolean },
  _command: Command,
): Promise<SingleResult<ProjectDeleteResult>> {
  const client = await connectToDaemon({ target: options.daemonTarget }).catch((error: unknown) => {
    throw buildDaemonConnectionCommandError({ target: options.daemonTarget, error });
  });

  try {
    let result: Awaited<ReturnType<typeof client.removeProject>>;
    if (options.ifNoActiveWorkspaces) {
      result = await client.removeProject(projectId, undefined, { ifNoActiveWorkspaces: true });
    } else if (options.ifEmpty) {
      result = await client.removeProject(projectId, undefined, { ifEmpty: true });
    } else {
      result = await client.removeProject(projectId);
    }
    return {
      type: "single",
      data: { projectId, removedWorkspaceIds: result.removedWorkspaceIds },
      schema: projectDeleteSchema,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw { code: "PROJECT_DELETE_FAILED", message } satisfies CommandError;
  } finally {
    await client.close().catch(() => undefined);
  }
}
