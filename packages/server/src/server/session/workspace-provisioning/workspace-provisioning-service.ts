import type { PluginLifecycle } from "../../plugins/lifecycle/index.js";
import { describeHookWorkspace } from "../../plugins/lifecycle/index.js";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import type { ProjectCheckoutLitePayload } from "@getpaseo/protocol/messages";
import type { Logger } from "pino";
import {
  generateWorkspaceId,
  initialWorkspacePlacement,
  reconcileWorkspacePlacement,
} from "../../workspace-registry-model.js";
import {
  createPersistedWorkspaceRecord,
  type PersistedProjectRecord,
  type PersistedWorkspaceRecord,
  type ProjectRegistry,
  type WorkspaceRegistry,
} from "../../workspace-registry.js";
import type { WorkspaceGitService } from "../../workspace-git-service.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../../worktree-session.js";
import { deriveProjectKey } from "../../project-key.js";
import { areEquivalentPaths, createRealpathAwarePathMatcher } from "../../../utils/path.js";
import type { UntrustedWorkspaceSource } from "../../workspace-automation-gate.js";

export interface ResolveOrCreateWorkspaceIdInput {
  createdWorktree: CreatePaseoWorktreeWorkflowResult | null;
  requestedWorkspaceId?: string;
  cwd: string;
  initialTitle: string | null;
  background?: boolean;
  callerWorkspaceId?: string;
}

export interface ImportWorkspaceInput {
  cwd: string;
  requestedWorkspaceId?: string;
}

export interface ImportWorkspaceResult<T> {
  value: T;
  createdWorkspace: PersistedWorkspaceRecord | null;
}

export interface CreateWorktreeWorkspaceInput {
  sourceCwd: string;
  projectId?: string;
  workspaceId?: string;
  repoRoot: string;
  cwd: string;
  worktreeRoot: string;
  branch: string | null;
  baseBranch: string | null;
  title: string | null;
  expectsInitialAgent?: boolean;
  untrustedSource?: UntrustedWorkspaceSource;
  background?: boolean;
  callerWorkspaceId?: string;
}

export interface WorkspaceProvisioningService {
  runInImportWorkspace<T>(
    input: ImportWorkspaceInput,
    operation: (workspace: PersistedWorkspaceRecord) => Promise<T>,
  ): Promise<ImportWorkspaceResult<T>>;
  findOrCreateWorkspaceForDirectory(
    cwd: string,
    title?: string | null,
  ): Promise<PersistedWorkspaceRecord>;
  resolveOrCreateWorkspaceIdForCreateAgent(input: ResolveOrCreateWorkspaceIdInput): Promise<string>;
  createWorkspaceForDirectory(
    cwd: string,
    title?: string | null,
    projectId?: string,
    context?: {
      expectsInitialAgent?: boolean;
      workspaceId?: string;
      background?: boolean;
      callerWorkspaceId?: string;
    },
  ): Promise<PersistedWorkspaceRecord>;
  createWorkspaceForWorktree(
    input: CreateWorktreeWorkspaceInput,
  ): Promise<PersistedWorkspaceRecord>;
  findOrCreateProjectForDirectory(
    cwd: string,
    options?: { exactRoot?: boolean },
  ): Promise<PersistedProjectRecord>;
  ensureWorkspaceRecordUnarchived(
    workspace: PersistedWorkspaceRecord,
  ): Promise<PersistedWorkspaceRecord>;
}

export type WorkspaceProvisioningErrorCode = "unknown_project" | "archived_project";

export class WorkspaceProvisioningError extends Error {
  constructor(
    readonly code: WorkspaceProvisioningErrorCode,
    projectId: string,
  ) {
    super(
      code === "unknown_project"
        ? `Unknown project: ${projectId}`
        : `Archived project: ${projectId}`,
    );
    this.name = "WorkspaceProvisioningError";
  }
}

export function createWorkspaceProvisioningService(deps: {
  serverId?: string;
  workspaceRegistry: WorkspaceRegistry;
  projectRegistry: ProjectRegistry;
  workspaceGitService: Pick<WorkspaceGitService, "getCheckout" | "getSnapshot">;
  isDirectory: (path: string) => Promise<boolean>;
  logger: Logger;
  lifecycle?: PluginLifecycle;
}): WorkspaceProvisioningService {
  const { serverId, workspaceRegistry, projectRegistry, workspaceGitService } = deps;
  const createAgentWorkspaceLocks = new Map<string, Promise<void>>();

  /**
   * Placement facts at a workspace directory, or null when there is nothing
   * there to read. A git read answers "not a checkout" for a plain directory
   * and for a directory that is gone, and only the first is evidence that a
   * worktree stopped being one. That answer therefore counts only while the
   * directory is there on both sides of the read, so a worktree removed or
   * unmounted while the read is in flight stays an absence.
   */
  async function observeWorkspaceCheckout(cwd: string): Promise<ProjectCheckoutLitePayload | null> {
    if (!(await deps.isDirectory(cwd))) return null;
    const checkout = await workspaceGitService.getCheckout(cwd);
    if (!checkout.isGit && !(await deps.isDirectory(cwd))) return null;
    return checkout;
  }

  async function runInImportWorkspace<T>(
    input: ImportWorkspaceInput,
    operation: (workspace: PersistedWorkspaceRecord) => Promise<T>,
  ): Promise<ImportWorkspaceResult<T>> {
    if (input.requestedWorkspaceId) {
      const workspace = await workspaceRegistry.get(input.requestedWorkspaceId);
      if (!workspace || workspace.archivedAt) {
        throw new Error(`Workspace not found: ${input.requestedWorkspaceId}`);
      }
      const project = await projectRegistry.get(workspace.projectId);
      if (!project || project.archivedAt) {
        throw new Error(`Project not found: ${workspace.projectId}`);
      }
      if (!createRealpathAwarePathMatcher(workspace.cwd)(input.cwd)) {
        throw new Error(`Import cwd does not match workspace: ${workspace.workspaceId}`);
      }
      return {
        value: await operation(workspace),
        createdWorkspace: null,
      };
    }

    const candidateWorkspaceId = generateWorkspaceId();
    const workspace = await findOrCreateWorkspaceForDirectory(
      input.cwd,
      undefined,
      candidateWorkspaceId,
    );
    // Once visible, another session or create-agent call may claim this record.
    // A failed provider import cannot prove it still owns the workspace, so it
    // leaves the record available for the next launch and ordinary cleanup.
    return {
      value: await operation(workspace),
      createdWorkspace: workspace.workspaceId === candidateWorkspaceId ? workspace : null,
    };
  }

  async function findOrCreateProjectForDirectory(
    cwd: string,
    options?: { exactRoot?: boolean },
  ): Promise<PersistedProjectRecord> {
    const requestedPath = resolve(cwd);
    let checkout = await workspaceGitService.getCheckout(requestedPath);
    const realPath = canonicalPath(requestedPath);
    if (!checkout.isGit && realPath !== requestedPath) {
      const realCheckout = await workspaceGitService.getCheckout(realPath);
      if (realCheckout.isGit) checkout = realCheckout;
    }
    const exactNestedRoot =
      options?.exactRoot === true &&
      checkout.isGit &&
      !checkout.mainRepoRoot &&
      !areEquivalentPaths(realPath, canonicalPath(checkout.worktreeRoot ?? realPath));
    const checkoutProjectRoot = exactNestedRoot
      ? realPath
      : projectRootForCheckout(requestedPath, checkout);
    const peerKey = deriveProjectKey({
      rootPath: checkoutProjectRoot,
      remoteUrl: checkout.remoteUrl,
      worktreeRoot:
        checkout.isGit && checkout.mainRepoRoot ? checkout.mainRepoRoot : checkout.worktreeRoot,
      mainRepoRoot: checkout.mainRepoRoot,
      serverId,
    });
    const activeProjects = checkout.isGit
      ? (await projectRegistry.list()).filter((project) => !project.archivedAt)
      : [];
    const rootPath = selectProjectRoot({
      requestedPath,
      checkout,
      activeProjects,
      checkoutProjectRoot,
      exactNestedRoot,
      peerKey,
    });
    const projectKey = deriveProjectKey({
      rootPath,
      remoteUrl: checkout.remoteUrl,
      worktreeRoot:
        checkout.isGit && checkout.mainRepoRoot ? checkout.mainRepoRoot : checkout.worktreeRoot,
      mainRepoRoot: checkout.mainRepoRoot,
      serverId,
    });
    const timestamp = new Date().toISOString();
    return projectRegistry.getOrCreateActiveByRoot({
      rootPath,
      kind: checkout.isGit ? "git" : "non_git",
      displayName: basename(rootPath) || rootPath,
      projectKey,
      timestamp,
    });
  }

  function selectProjectRoot(input: {
    requestedPath: string;
    checkout: ProjectCheckoutLitePayload;
    activeProjects: PersistedProjectRecord[];
    checkoutProjectRoot: string;
    exactNestedRoot: boolean;
    peerKey: string;
  }): string {
    const {
      requestedPath,
      checkout,
      activeProjects,
      checkoutProjectRoot,
      exactNestedRoot,
      peerKey,
    } = input;
    if (exactNestedRoot) {
      const matches = createRealpathAwarePathMatcher(checkoutProjectRoot);
      const existing = activeProjects.find((project) => matches(project.rootPath));
      return existing?.rootPath ?? checkoutProjectRoot;
    }
    if (checkout.mainRepoRoot) return checkoutProjectRoot;
    const checkoutRoot = resolve(checkout.worktreeRoot ?? requestedPath);
    const nested = activeProjects
      .filter(
        (project) =>
          !areEquivalentPaths(project.rootPath, checkoutRoot) &&
          isAtOrBelow(project.rootPath, checkoutRoot) &&
          isAtOrBelow(requestedPath, project.rootPath),
      )
      .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
    if (nested) return nested.rootPath;
    // Standalone review clones share a remote key, but not a Git common dir.
    const remotePeers = checkout.remoteUrl
      ? activeProjects.filter(
          (project) =>
            project.kind === "git" &&
            project.projectKey === peerKey &&
            existsSync(project.rootPath),
        )
      : [];
    return [checkoutProjectRoot, ...remotePeers.map((project) => project.rootPath)].sort(
      (left, right) =>
        left.split(sep).length - right.split(sep).length ||
        left.length - right.length ||
        left.localeCompare(right),
    )[0];
  }

  function projectRootForCheckout(cwd: string, checkout: ProjectCheckoutLitePayload): string {
    // mainRepoRoot is derived from Git's common dir, so a linked worktree's
    // folder name cannot turn it into a separate top-level project.
    if (!checkout.isGit) return cwd;
    const checkoutRoot = resolve(checkout.worktreeRoot ?? cwd);
    const withinCheckout = relative(canonicalPath(checkoutRoot), canonicalPath(cwd));
    if (
      withinCheckout === ".." ||
      withinCheckout.startsWith(`..${sep}`) ||
      isAbsolute(withinCheckout)
    ) {
      return cwd;
    }
    if (checkout.mainRepoRoot) return resolve(checkout.mainRepoRoot);
    // A selected nested path inside a normal checkout can be its own project.
    // Only a linked worktree's common dir is authoritative for re-homing.
    return withinCheckout && !checkout.remoteUrl ? cwd : checkoutRoot;
  }

  function canonicalPath(target: string): string {
    try {
      return realpathSync(target);
    } catch {
      return resolve(target);
    }
  }

  function isAtOrBelow(target: string, root: string): boolean {
    const rel = relative(canonicalPath(root), canonicalPath(target));
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  }

  async function requireActiveProject(projectId: string): Promise<PersistedProjectRecord> {
    const project = await projectRegistry.get(projectId);
    if (!project) throw new WorkspaceProvisioningError("unknown_project", projectId);
    if (project.archivedAt) throw new WorkspaceProvisioningError("archived_project", projectId);
    return project;
  }

  async function resolveBackground(input?: {
    background?: boolean;
    callerWorkspaceId?: string;
  }): Promise<boolean> {
    if (input?.background !== undefined) return input.background;
    if (!input?.callerWorkspaceId) return false;
    const callerWorkspace = await workspaceRegistry.get(input.callerWorkspaceId);
    if (!callerWorkspace) throw new Error(`Caller workspace ${input.callerWorkspaceId} not found`);
    return callerWorkspace.background;
  }

  async function createWorkspaceForDirectory(
    cwd: string,
    title?: string | null,
    projectId?: string,
    context?: {
      expectsInitialAgent?: boolean;
      workspaceId?: string;
      background?: boolean;
      callerWorkspaceId?: string;
    },
  ): Promise<PersistedWorkspaceRecord> {
    const normalizedCwd = resolve(cwd);
    const checkout = await workspaceGitService.getCheckout(normalizedCwd);
    const managedGitCheckout =
      checkout.isGit && Boolean(checkout.mainRepoRoot || checkout.remoteUrl);
    let project: PersistedProjectRecord;
    if (managedGitCheckout || !projectId) {
      // COMPAT(workspaceCreateMissingProjectId): added in v0.1.107, remove after 2027-01-15.
      project = await findOrCreateProjectForDirectory(normalizedCwd);
    } else {
      project = await refreshProjectKind(
        await requireActiveProject(projectId),
        normalizedCwd,
        checkout,
      );
    }
    const timestamp = new Date().toISOString();
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: context?.workspaceId ?? generateWorkspaceId(),
      projectId: project.projectId,
      ...initialWorkspacePlacement({ source: "checkout", cwd: normalizedCwd, checkout }),
      title: title?.trim() || null,
      createdAt: timestamp,
      updatedAt: timestamp,
      background: await resolveBackground(context),
    });
    const claimed = await workspaceRegistry.getOrCreateActiveByCwd(workspace, {
      expectsInitialAgent: context?.expectsInitialAgent,
      ...(managedGitCheckout || !projectId ? { rehomeProjectId: project.projectId } : {}),
    });
    if (claimed.created) {
      emitWorkspaceCreated(claimed.workspace);
    }
    return claimed.workspace;
  }

  async function createWorkspaceForWorktree(
    input: CreateWorktreeWorkspaceInput,
  ): Promise<PersistedWorkspaceRecord> {
    const sourceCwd = resolve(input.sourceCwd);
    const repoRoot = resolve(input.repoRoot);
    const cwd = resolve(input.cwd);
    const worktreeRoot = resolve(input.worktreeRoot);
    const project = await resolveSourceProjectForWorktree({
      sourceCwd,
      projectId: input.projectId,
      repoRoot,
    });
    const timestamp = new Date().toISOString();
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: input.workspaceId ?? generateWorkspaceId(),
      projectId: project.projectId,
      ...initialWorkspacePlacement({
        source: "created_worktree",
        cwd,
        worktreeRoot,
        branch: input.branch,
        baseBranch: input.baseBranch,
        mainRepoRoot: repoRoot,
      }),
      title: input.title,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.untrustedSource ? { untrustedSource: input.untrustedSource } : {}),
      background: await resolveBackground(input),
    });
    const claimed = await workspaceRegistry.getOrCreateActiveByCwd(workspace, {
      expectsInitialAgent: input.expectsInitialAgent,
    });
    if (claimed.created) {
      emitWorkspaceCreated(claimed.workspace);
    }
    return claimed.workspace;
  }

  function emitWorkspaceCreated(workspace: PersistedWorkspaceRecord): void {
    deps.lifecycle?.emit("workspace.created", { workspace: describeHookWorkspace(workspace) });
  }

  async function resolveSourceProjectForWorktree(input: {
    sourceCwd: string;
    projectId?: string;
    repoRoot: string;
  }): Promise<PersistedProjectRecord> {
    if (input.projectId) {
      return refreshProjectKind(await requireActiveProject(input.projectId));
    }

    const workspaces = await workspaceRegistry.list();
    const sourceWorkspace =
      workspaces.find(
        (workspace) => !workspace.archivedAt && areEquivalentPaths(workspace.cwd, input.sourceCwd),
      ) ??
      workspaces.find(
        (workspace) => !workspace.archivedAt && areEquivalentPaths(workspace.cwd, input.repoRoot),
      );
    if (sourceWorkspace) {
      const project = await projectRegistry.get(sourceWorkspace.projectId);
      if (project) return refreshProjectKind(project);
      // COMPAT(worktreeMissingSourceProject): added in v0.1.107, remove after 2027-01-15.
      // Orphaned legacy workspace FKs fall through to exact-root allocation.
    }

    const checkout = await workspaceGitService.getCheckout(input.repoRoot);
    const project = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: input.repoRoot,
      kind: "git",
      displayName: basename(input.repoRoot) || input.repoRoot,
      projectKey: deriveProjectKey({
        rootPath: input.repoRoot,
        remoteUrl: checkout.remoteUrl,
        worktreeRoot: checkout.worktreeRoot,
        mainRepoRoot: checkout.mainRepoRoot,
        serverId,
      }),
      timestamp: new Date().toISOString(),
    });
    return refreshProjectKind(project);
  }

  async function findOrCreateWorkspaceForDirectory(
    cwd: string,
    title?: string | null,
    candidateWorkspaceId?: string,
  ): Promise<PersistedWorkspaceRecord> {
    const normalizedCwd = resolve(cwd);
    // Path-based discovery selects public work; explicit-ID recovery bypasses this selector.
    const workspaces = (await workspaceRegistry.list())
      .filter(
        (workspace) => !workspace.background && areEquivalentPaths(workspace.cwd, normalizedCwd),
      )
      .sort(
        (left, right) =>
          Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
          left.workspaceId.localeCompare(right.workspaceId),
      );
    const active = workspaces.find((workspace) => !workspace.archivedAt);
    if (active) return refreshWorkspaceRecord(active);
    const archived = workspaces.find((workspace) => workspace.archivedAt);
    if (archived) {
      const project = await projectRegistry.get(archived.projectId);
      if (project && !project.archivedAt) return ensureWorkspaceRecordUnarchived(archived);
    }
    return createWorkspaceForDirectory(normalizedCwd, title, undefined, {
      workspaceId: candidateWorkspaceId,
    });
  }

  async function resolveOrCreateWorkspaceIdForCreateAgent(
    input: ResolveOrCreateWorkspaceIdInput,
  ): Promise<string> {
    if (input.createdWorktree) return input.createdWorktree.workspace.workspaceId;
    if (input.requestedWorkspaceId) return input.requestedWorkspaceId;

    const background = await resolveBackground(input);
    const cwd = resolve(input.cwd);
    const sandbox = resolve(homedir(), "Paseo", "Sandbox");
    const inDirectory = (root: string) => cwd === root || cwd.startsWith(`${root}/`);
    let repoRoot = cwd;
    while (!existsSync(join(repoRoot, ".git"))) {
      const parent = dirname(repoRoot);
      if (parent === repoRoot) break;
      repoRoot = parent;
    }
    const throwaway =
      !existsSync(join(repoRoot, ".git")) &&
      (["/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].some(inDirectory) ||
        inDirectory(sandbox));
    const workspaceCwd = throwaway ? resolve(homedir(), "Paseo", "Scratch") : cwd;

    const realPath = (target: string) => {
      try {
        return realpathSync(target);
      } catch {
        return resolve(target);
      }
    };
    const lockKey = realPath(workspaceCwd);
    const previous = createAgentWorkspaceLocks.get(lockKey);
    let release!: () => void;
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });
    createAgentWorkspaceLocks.set(lockKey, current);
    if (previous) await previous;
    try {
      const project = await findOrCreateProjectForDirectory(workspaceCwd);
      const workspaces = await workspaceRegistry.list();
      const active = workspaces
        .filter(
          (workspace) =>
            !workspace.archivedAt &&
             workspace.background === background &&
            workspace.projectId === project.projectId &&
            workspace.kind !== "worktree" &&
            !workspace.isPaseoOwnedWorktree &&
            !(workspace.worktreeRoot && workspace.mainRepoRoot) &&
            areEquivalentPaths(realPath(workspace.cwd), lockKey),
        )
        .sort(
          (left, right) =>
            Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
            left.workspaceId.localeCompare(right.workspaceId),
        )[0];
      if (active) return active.workspaceId;
      return (
        await createWorkspaceForDirectory(workspaceCwd, input.initialTitle, undefined, {
          expectsInitialAgent: true,
          background,
          callerWorkspaceId: input.callerWorkspaceId,
        })
      ).workspaceId;
    } finally {
      if (createAgentWorkspaceLocks.get(lockKey) === current) {
        createAgentWorkspaceLocks.delete(lockKey);
      }
      release();
    }
  }

  async function resolveRestoredAutoArchiveChangeRequestUrl(
    workspace: PersistedWorkspaceRecord,
  ): Promise<string | null> {
    if (!workspace.archivedAt) {
      return workspace.autoArchivedChangeRequestUrl;
    }
    const snapshot = await workspaceGitService.getSnapshot(workspace.cwd, {
      force: true,
      includeForge: true,
      reason: "workspace-restore-auto-archive-latch",
    });
    return snapshot.forge.pullRequest?.isMerged
      ? snapshot.forge.pullRequest.url
      : workspace.autoArchivedChangeRequestUrl;
  }

  async function ensureWorkspaceRecordUnarchived(
    workspace: PersistedWorkspaceRecord,
  ): Promise<PersistedWorkspaceRecord> {
    const project = await projectRegistry.get(workspace.projectId);
    if (!project) throw new Error(`Unknown project: ${workspace.projectId}`);
    const timestamp = new Date().toISOString();
    const checkout =
      workspace.archivedAt || project.archivedAt
        ? await observeWorkspaceCheckout(workspace.cwd)
        : null;
    const autoArchivedChangeRequestUrl =
      await resolveRestoredAutoArchiveChangeRequestUrl(workspace);
    let next: PersistedWorkspaceRecord | null = null;
    if (workspace.archivedAt) {
      const placementUpdate = reconcileWorkspacePlacement({
        workspace,
        checkout,
        updatedAt: timestamp,
      });
      next = {
        ...(placementUpdate?.workspace ?? workspace),
        archivedAt: null,
        autoArchivedChangeRequestUrl,
        updatedAt: timestamp,
      };
    }
    if (project.archivedAt || workspace.archivedAt) {
      const projectCheckout =
        checkout && areEquivalentPaths(project.rootPath, workspace.cwd)
          ? checkout
          : await workspaceGitService.getCheckout(project.rootPath);
      const kind = projectCheckout.isGit ? "git" : "non_git";
      const projectKey = deriveProjectKey({
        rootPath: project.rootPath,
        remoteUrl: projectCheckout.remoteUrl,
        worktreeRoot: projectCheckout.worktreeRoot,
        mainRepoRoot: projectCheckout.mainRepoRoot,
        serverId,
      });
      if (project.archivedAt || project.kind !== kind || project.projectKey !== projectKey) {
        await projectRegistry.upsert({
          ...project,
          kind,
          projectKey,
          archivedAt: null,
          updatedAt: timestamp,
        });
      }
    }
    if (!next) return workspace;
    await workspaceRegistry.upsert(next);
    return next;
  }

  async function refreshWorkspaceRecord(
    workspace: PersistedWorkspaceRecord,
  ): Promise<PersistedWorkspaceRecord> {
    const checkout = await observeWorkspaceCheckout(workspace.cwd);
    const project = await projectRegistry.get(workspace.projectId);
    if (project && !project.archivedAt) {
      await refreshProjectKind(project, workspace.cwd, checkout ?? undefined);
    }
    const update = reconcileWorkspacePlacement({
      workspace,
      checkout,
      updatedAt: new Date().toISOString(),
    });
    if (!update) return workspace;
    await workspaceRegistry.upsert(update.workspace);
    return update.workspace;
  }

  async function refreshProjectKind(
    project: PersistedProjectRecord,
    workspaceCwd?: string,
    workspaceCheckout?: Awaited<ReturnType<WorkspaceGitService["getCheckout"]>>,
  ): Promise<PersistedProjectRecord> {
    const projectCheckout =
      workspaceCwd && workspaceCheckout && areEquivalentPaths(project.rootPath, workspaceCwd)
        ? workspaceCheckout
        : await workspaceGitService.getCheckout(project.rootPath);
    const kind: PersistedProjectRecord["kind"] = projectCheckout.isGit ? "git" : "non_git";
    const projectKey = deriveProjectKey({
      rootPath: project.rootPath,
      remoteUrl: projectCheckout.remoteUrl,
      worktreeRoot: projectCheckout.worktreeRoot,
      mainRepoRoot: projectCheckout.mainRepoRoot,
      serverId,
    });
    if (project.kind === kind && project.projectKey === projectKey) return project;
    const refreshed = {
      ...project,
      kind,
      projectKey,
      updatedAt: new Date().toISOString(),
    };
    await projectRegistry.upsert(refreshed);
    return refreshed;
  }

  return {
    runInImportWorkspace,
    findOrCreateWorkspaceForDirectory,
    resolveOrCreateWorkspaceIdForCreateAgent,
    createWorkspaceForDirectory,
    createWorkspaceForWorktree,
    findOrCreateProjectForDirectory,
    ensureWorkspaceRecordUnarchived,
  };
}
