import { readFileSync } from "node:fs";
import {
  INITIAL_PROJECT_GROUPS,
  ProjectGroupOperationSchema,
  type ProjectGroupRule,
} from "@getpaseo/protocol/project-groups";
import {
  resolveProjectGroup,
  migrateProjectGroupPrefixes,
  projectGroupOperation,
} from "./project-grouping.js";
import os from "node:os";
import path from "node:path";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";

import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../test-utils/test-logger.js";
import { writeJsonFileAtomic } from "./atomic-file.js";
import {
  createPersistedProjectRecord,
  createPersistedWorkspaceRecord,
  FileBackedProjectRegistry,
  FileBackedWorkspaceRegistry,
  resolveWorkspaceDisplayName,
  resolveWorkspaceName,
  type WorkspaceMutation,
} from "./workspace-registry.js";

describe("resolveWorkspaceName", () => {
  test("prefers the user-set title over the derived display name", () => {
    expect(
      resolveWorkspaceName({ title: "Payments work", derivedDisplayName: "feature/payments" }),
    ).toBe("Payments work");
  });

  test("falls back to the derived display name when there is no title", () => {
    expect(resolveWorkspaceName({ title: null, derivedDisplayName: "feature/payments" })).toBe(
      "feature/payments",
    );
  });

  test("createPersistedWorkspaceRecord defaults background to false and preserves explicit intent", () => {
    const base = {
      workspaceId: "ws-1",
      projectId: "proj-1",
      cwd: "/tmp/repo",
      kind: "local_checkout" as const,
      displayName: "main",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };
    expect(createPersistedWorkspaceRecord(base).background).toBe(false);
    expect(createPersistedWorkspaceRecord({ ...base, background: false }).background).toBe(false);
    expect(createPersistedWorkspaceRecord({ ...base, background: true }).background).toBe(true);
  });

  test("resolveWorkspaceDisplayName applies the same rule over the persisted record", () => {
    const record = createPersistedWorkspaceRecord({
      workspaceId: "ws-1",
      projectId: "proj-1",
      cwd: "/tmp/repo",
      kind: "local_checkout",
      displayName: "main",
      title: "Renamed",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(resolveWorkspaceDisplayName(record)).toBe("Renamed");
    expect(resolveWorkspaceDisplayName({ ...record, title: null })).toBe("main");
  });
});

describe("workspace registries", () => {
  let tmpDir: string;
  let projectRegistry: FileBackedProjectRegistry;
  let workspaceRegistry: FileBackedWorkspaceRegistry;
  const logger = createTestLogger();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "workspace-registry-"));
    projectRegistry = new FileBackedProjectRegistry(
      path.join(tmpDir, "projects", "projects.json"),
      logger,
    );
    workspaceRegistry = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "projects", "workspaces.json"),
      logger,
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates, updates, archives, deletes, and lists project records", async () => {
    await projectRegistry.initialize();
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "remote:github.com/acme/repo",
        rootPath: "/tmp/repo",
        kind: "git",
        displayName: "acme/repo",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "remote:github.com/acme/repo",
        rootPath: "/tmp/repo",
        kind: "git",
        displayName: "acme/repo",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      }),
    );
    await projectRegistry.archive("remote:github.com/acme/repo", "2026-03-03T00:00:00.000Z");

    const archived = await projectRegistry.get("remote:github.com/acme/repo");
    expect(archived?.archivedAt).toBe("2026-03-03T00:00:00.000Z");
    expect(await projectRegistry.list()).toHaveLength(1);

    await projectRegistry.remove("remote:github.com/acme/repo");
    expect(await projectRegistry.get("remote:github.com/acme/repo")).toBeNull();
    expect(await projectRegistry.list()).toEqual([]);
  });

  test("writes once per mutation and skips missing-record mutations", async () => {
    let writes = 0;
    const registry = new FileBackedProjectRegistry(
      path.join(tmpDir, "projects", "write-count.json"),
      logger,
      {
        writeRecords: async (filePath, records) => {
          writes++;
          await writeJsonFileAtomic(filePath, records);
        },
      },
    );
    const project = createPersistedProjectRecord({
      projectId: "counted",
      rootPath: tmpDir,
      kind: "git",
      displayName: "Counted",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await registry.upsert(project);
    expect(writes).toBe(1);
    await registry.update("missing", (current) => current);
    await registry.remove("missing");
    expect(writes).toBe(1);
    await registry.update(project.projectId, (current) => ({ ...current, customName: "Changed" }));
    expect(writes).toBe(2);
  });

  test("preserves a concurrent project update when archiving", async () => {
    let pauseNextWrite = false;
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const concurrentRegistry = new FileBackedProjectRegistry(
      path.join(tmpDir, "projects", "concurrent-projects.json"),
      logger,
      {
        writeRecords: async (filePath, records) => {
          if (pauseNextWrite) {
            pauseNextWrite = false;
            writeStarted();
            await release;
          }
          await writeJsonFileAtomic(filePath, records);
        },
      },
    );
    const project = createPersistedProjectRecord({
      projectId: "project-concurrent",
      rootPath: "/tmp/project-concurrent",
      kind: "git",
      displayName: "project-concurrent",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await concurrentRegistry.upsert(project);
    pauseNextWrite = true;

    const update = concurrentRegistry.update(project.projectId, (current) => ({
      ...current,
      customName: "Kept name",
      updatedAt: "2026-03-02T00:00:00.000Z",
    }));
    await started;
    const archive = concurrentRegistry.archive(project.projectId, "2026-03-03T00:00:00.000Z");
    releaseWrite();
    await Promise.all([update, archive]);

    expect(await concurrentRegistry.get(project.projectId)).toMatchObject({
      customName: "Kept name",
      archivedAt: "2026-03-03T00:00:00.000Z",
    });
  });

  test("publishes only project mutations that change the persisted lifecycle", async () => {
    await projectRegistry.initialize();
    const mutations: Array<{
      kind: "upsert" | "archive" | "remove";
      projectId: string;
      project: ReturnType<typeof createPersistedProjectRecord> | null;
    }> = [];
    const unsubscribe = projectRegistry.subscribeToMutations((mutation) => {
      mutations.push(mutation);
    });
    const active = createPersistedProjectRecord({
      projectId: "project-one",
      rootPath: "/tmp/project-one",
      kind: "non_git",
      displayName: "project-one",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    const archived = {
      ...active,
      updatedAt: "2026-03-02T00:00:00.000Z",
      archivedAt: "2026-03-02T00:00:00.000Z",
    };

    await projectRegistry.upsert(active);
    await projectRegistry.archive(active.projectId, archived.archivedAt);
    await projectRegistry.archive(active.projectId, "2026-03-03T00:00:00.000Z");
    await projectRegistry.archive("project-unknown", "2026-03-03T00:00:00.000Z");
    await projectRegistry.remove(active.projectId);
    await projectRegistry.remove(active.projectId);
    await projectRegistry.remove("project-unknown");

    expect(mutations).toEqual([
      { kind: "upsert", projectId: active.projectId, project: active },
      { kind: "archive", projectId: active.projectId, project: archived },
      { kind: "remove", projectId: active.projectId, project: null },
    ]);
    unsubscribe();
  });

  test("atomically allocates one opaque project for concurrent exact-root adds", async () => {
    await projectRegistry.initialize();
    const rootPath = path.join(tmpDir, "same-root");
    const projects = await Promise.all(
      Array.from({ length: 20 }, () =>
        projectRegistry.getOrCreateActiveByRoot({
          rootPath,
          kind: "non_git",
          displayName: "same-root",
          timestamp: "2026-03-01T00:00:00.000Z",
        }),
      ),
    );

    expect(new Set(projects.map((project) => project.projectId))).toEqual(
      new Set([projects[0]!.projectId]),
    );
    expect(projects[0]!.projectId).toMatch(/^prj_[0-9a-f]{16}$/);
    expect(await projectRegistry.list()).toHaveLength(1);
  });

  test("keeps readable legacy IDs alongside newly allocated opaque IDs", async () => {
    await projectRegistry.initialize();
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "remote:github.com/acme/repo",
        rootPath: "/tmp/legacy",
        kind: "git",
        displayName: "repo",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );
    const opaque = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: "/tmp/new",
      kind: "non_git",
      displayName: "new",
      timestamp: "2026-03-01T00:00:00.000Z",
    });
    expect((await projectRegistry.get("remote:github.com/acme/repo"))?.rootPath).toBe(
      "/tmp/legacy",
    );
    expect(opaque.projectId).toMatch(/^prj_[0-9a-f]{16}$/);
  });

  test("allocates a fresh opaque ID when only an archived exact root exists", async () => {
    await projectRegistry.initialize();
    const rootPath = path.join(tmpDir, "archived-root");
    const archived = createPersistedProjectRecord({
      projectId: "prj_archived",
      rootPath,
      kind: "non_git",
      displayName: "archived-root",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      archivedAt: "2026-03-02T00:00:00.000Z",
    });
    await projectRegistry.upsert(archived);

    const created = await projectRegistry.getOrCreateActiveByRoot({
      rootPath,
      kind: "non_git",
      displayName: "archived-root",
      timestamp: "2026-03-03T00:00:00.000Z",
    });

    expect(created).toMatchObject({ rootPath, archivedAt: null });
    expect(created.projectId).not.toBe(archived.projectId);
    expect(await projectRegistry.get(archived.projectId)).toEqual(archived);
  });

  test("refreshes the oldest active legacy duplicate kind without rewriting its identity", async () => {
    await projectRegistry.initialize();
    const rootPath = path.join(tmpDir, "legacy-root");
    const oldest = createPersistedProjectRecord({
      projectId: "remote:oldest",
      rootPath,
      kind: "git",
      displayName: "oldest",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    const duplicate = createPersistedProjectRecord({
      projectId: "remote:duplicate",
      rootPath,
      kind: "git",
      displayName: "duplicate",
      createdAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });
    await projectRegistry.upsert(oldest);
    await projectRegistry.upsert(duplicate);

    await expect(
      projectRegistry.getOrCreateActiveByRoot({
        rootPath,
        kind: "non_git",
        displayName: "new-name",
        timestamp: "2026-03-03T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      ...oldest,
      kind: "non_git",
      updatedAt: "2026-03-03T00:00:00.000Z",
    });
    expect(await projectRegistry.list()).toEqual([
      { ...oldest, kind: "non_git", updatedAt: "2026-03-03T00:00:00.000Z" },
      duplicate,
    ]);
  });

  test("reuses an active project for Windows lexical-equivalent root spellings", async () => {
    await projectRegistry.initialize();
    const first = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: "C:\\Users\\Paseo\\Repo",
      kind: "git",
      displayName: "Repo",
      timestamp: "2026-03-01T00:00:00.000Z",
    });
    const second = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: "c:/users/paseo/repo/.",
      kind: "git",
      displayName: "Repo",
      timestamp: "2026-03-02T00:00:00.000Z",
    });

    expect(second).toEqual(first);
    expect(await projectRegistry.list()).toEqual([first]);
  });

  test("keeps lexical and symlink root spellings distinct without realpath", async () => {
    await projectRegistry.initialize();
    const target = path.join(tmpDir, "target");
    const link = path.join(tmpDir, "link");
    mkdirSync(target);
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");

    const targetProject = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: target,
      kind: "non_git",
      displayName: "target",
      timestamp: "2026-03-01T00:00:00.000Z",
    });
    const linkProject = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: link,
      kind: "non_git",
      displayName: "link",
      timestamp: "2026-03-02T00:00:00.000Z",
    });

    expect(linkProject.projectId).not.toBe(targetProject.projectId);
    expect(await projectRegistry.list()).toEqual([targetProject, linkProject]);
  });

  test("retries a generated project ID collision", async () => {
    const generatedIds = ["prj_collision", "prj_fresh"];
    projectRegistry = new FileBackedProjectRegistry(
      path.join(tmpDir, "projects", "projects.json"),
      logger,
      { projectIdFactory: () => generatedIds.shift() ?? "prj_unexpected" },
    );
    await projectRegistry.initialize();
    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "prj_collision",
        rootPath: path.join(tmpDir, "existing"),
        kind: "non_git",
        displayName: "existing",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    const created = await projectRegistry.getOrCreateActiveByRoot({
      rootPath: path.join(tmpDir, "new"),
      kind: "non_git",
      displayName: "new",
      timestamp: "2026-03-02T00:00:00.000Z",
    });

    expect(created.projectId).toBe("prj_fresh");
    expect(await projectRegistry.list()).toHaveLength(2);
  });

  test("project record schema accepts records without customName (legacy on-disk records)", async () => {
    await projectRegistry.initialize();

    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "remote:github.com/acme/repo",
        rootPath: "/tmp/repo",
        kind: "git",
        displayName: "acme/repo",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    const record = await projectRegistry.get("remote:github.com/acme/repo");
    expect(record?.customName).toBeNull();
  });

  test("project record persists a customName override", async () => {
    await projectRegistry.initialize();

    await projectRegistry.upsert(
      createPersistedProjectRecord({
        projectId: "remote:github.com/acme/repo",
        rootPath: "/home/me/work/repo",
        kind: "git",
        displayName: "acme/repo",
        customName: "Acme (work)",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    const record = await projectRegistry.get("remote:github.com/acme/repo");
    expect(record?.customName).toBe("Acme (work)");
    expect(record?.displayName).toBe("acme/repo");
  });

  test("creates, updates, archives, deletes, and lists workspace records", async () => {
    await workspaceRegistry.initialize();
    const mutations: WorkspaceMutation[] = [];
    workspaceRegistry.subscribeToMutations((mutation) => {
      mutations.push(mutation);
    });
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "/tmp/repo",
        projectId: "remote:github.com/acme/repo",
        cwd: "/tmp/repo",
        kind: "local_checkout",
        displayName: "main",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "/tmp/repo",
        projectId: "remote:github.com/acme/repo",
        cwd: "/tmp/repo",
        kind: "local_checkout",
        displayName: "feature/workspace",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      }),
    );
    await workspaceRegistry.archive("/tmp/repo", "2026-03-03T00:00:00.000Z");

    const archived = await workspaceRegistry.get("/tmp/repo");
    expect(archived?.displayName).toBe("feature/workspace");
    expect(archived?.archivedAt).toBe("2026-03-03T00:00:00.000Z");

    await workspaceRegistry.remove("/tmp/repo");
    expect(mutations.at(-1)).toEqual({
      kind: "remove",
      workspaceId: "/tmp/repo",
      workspace: archived,
    });
    expect(await workspaceRegistry.get("/tmp/repo")).toBeNull();
    expect(await workspaceRegistry.list()).toEqual([]);
  });

  test("claims one active workspace for concurrent opens of the same real directory", async () => {
    const checkout = path.join(tmpDir, "checkout");
    const alias = path.join(tmpDir, "checkout-alias");
    const other = path.join(tmpDir, "other");
    mkdirSync(checkout);
    mkdirSync(other);
    symlinkSync(checkout, alias);
    const record = (workspaceId: string, cwd: string) =>
      createPersistedWorkspaceRecord({
        workspaceId,
        projectId: "project-one",
        cwd,
        kind: "local_checkout",
        displayName: workspaceId,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      });

    const [first, second] = await Promise.all([
      workspaceRegistry.getOrCreateActiveByCwd(record("workspace-one", checkout)),
      workspaceRegistry.getOrCreateActiveByCwd(record("workspace-two", alias)),
    ]);
    const distinct = await workspaceRegistry.getOrCreateActiveByCwd(
      record("workspace-three", other),
    );

    expect(first).toEqual({
      workspace: expect.objectContaining({ workspaceId: "workspace-one" }),
      created: true,
    });
    expect(second).toEqual({
      workspace: expect.objectContaining({ workspaceId: "workspace-one" }),
      created: false,
    });
    expect(distinct).toEqual({
      workspace: expect.objectContaining({ workspaceId: "workspace-three" }),
      created: true,
    });
    expect(
      (await workspaceRegistry.list()).filter((workspace) => !workspace.archivedAt),
    ).toHaveLength(2);
  });

  test("guarded empty project removal excludes archived references and racing claims", async () => {
    const record = createPersistedWorkspaceRecord({
      workspaceId: "workspace-one",
      projectId: "project-one",
      cwd: path.join(tmpDir, "checkout"),
      kind: "local_checkout",
      displayName: "checkout",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    await workspaceRegistry.upsert({ ...record, archivedAt: "2026-03-02T00:00:00.000Z" });
    const remove = vi.fn(async () => {});
    expect(
      await workspaceRegistry.removeProjectIfUnreferenced("project-one", remove, async () => true),
    ).toBe(false);
    expect(remove).not.toHaveBeenCalled();

    await workspaceRegistry.remove(record.workspaceId);
    let enterRemoval!: () => void;
    const removing = new Promise<void>((resolve) => (enterRemoval = resolve));
    let finishRemoval!: () => void;
    const removalHeld = new Promise<void>((resolve) => (finishRemoval = resolve));
    const removal = workspaceRegistry.removeProjectIfUnreferenced(
      "project-one",
      async () => {
        enterRemoval();
        await removalHeld;
      },
      async () => false,
    );
    await removing;
    const claim = workspaceRegistry.getOrCreateActiveByCwd(record);
    finishRemoval();
    expect(await removal).toBe(true);
    await expect(claim).rejects.toThrow("Project is being removed");
    await expect(workspaceRegistry.upsert(record)).rejects.toThrow("Project is being removed");
    expect(await workspaceRegistry.list()).toEqual([]);
  });

  test("archived-history project removal rejects active records and racing claims", async () => {
    const archived = createPersistedWorkspaceRecord({
      workspaceId: "workspace-archived",
      projectId: "project-history",
      cwd: path.join(tmpDir, "history"),
      kind: "local_checkout",
      displayName: "history",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
      archivedAt: "2026-03-02T00:00:00.000Z",
    });
    const active = createPersistedWorkspaceRecord({
      ...archived,
      workspaceId: "workspace-active",
      projectId: "project-active",
      cwd: path.join(tmpDir, "active"),
      archivedAt: null,
    });
    await workspaceRegistry.upsert(archived);
    await workspaceRegistry.upsert(active);
    const remove = vi.fn(async () => {});
    expect(
      await workspaceRegistry.removeProjectIfUnreferenced(
        "project-active",
        remove,
        async () => true,
        { allowArchivedReferences: true },
      ),
    ).toBe(false);
    expect(remove).not.toHaveBeenCalled();

    let entered!: () => void;
    const removing = new Promise<void>((resolve) => (entered = resolve));
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const removeHistory = vi.fn(async () => {
      entered();
      await held;
    });
    const removal = workspaceRegistry.removeProjectIfUnreferenced(
      "project-history",
      removeHistory,
      async () => false,
      { allowArchivedReferences: true },
    );
    await removing;
    const claim = workspaceRegistry.getOrCreateActiveByCwd({
      ...archived,
      workspaceId: "workspace-late",
      archivedAt: null,
    });
    release();
    expect(await removal).toBe(true);
    await expect(claim).rejects.toThrow("Project is being removed");
    expect(await workspaceRegistry.get(archived.workspaceId)).toEqual(archived);
    expect(removeHistory).toHaveBeenCalledOnce();
  });

  test("failed pre-commit project removal releases its admission fence", async () => {
    await expect(
      workspaceRegistry.removeProjectIfUnreferenced(
        "project-one",
        async () => {
          throw new Error("write failed");
        },
        async () => true,
      ),
    ).rejects.toThrow("write failed");
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "workspace-one",
      projectId: "project-one",
      cwd: path.join(tmpDir, "checkout"),
      kind: "local_checkout",
      displayName: "checkout",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect((await workspaceRegistry.getOrCreateActiveByCwd(workspace)).created).toBe(true);
  });

  test("preserves the first workspace archive and reports whether a queued archive applied", async () => {
    await workspaceRegistry.initialize();
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "workspace-one",
        projectId: "project-one",
        cwd: "/tmp/repo",
        kind: "local_checkout",
        displayName: "main",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    const events: WorkspaceMutation[] = [];
    workspaceRegistry.subscribeToMutations((event) => {
      events.push(event);
    });
    expect(
      await Promise.all([
        workspaceRegistry.archive("workspace-one", "2026-03-02T00:00:00.000Z"),
        workspaceRegistry.archive("workspace-one", "2026-03-03T00:00:00.000Z"),
      ]),
    ).toEqual([true, false]);
    expect(events.map((event) => event.kind)).toEqual(["archive"]);
    const reloaded = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "projects", "workspaces.json"),
      logger,
    );
    expect(await reloaded.get("workspace-one")).toMatchObject({
      archivedAt: "2026-03-02T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });
  });

  test("persists the consumed change request with the workspace archive", async () => {
    await workspaceRegistry.initialize();
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "workspace-auto-archive",
        projectId: "project-one",
        cwd: "/tmp/repo",
        kind: "worktree",
        displayName: "feature",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    await workspaceRegistry.archive("workspace-auto-archive", "2026-03-02T00:00:00.000Z", {
      autoArchivedChangeRequestUrl: "https://github.com/acme/repo/pull/123",
    });

    const reloaded = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "projects", "workspaces.json"),
      logger,
    );
    await reloaded.initialize();
    expect(await reloaded.get("workspace-auto-archive")).toMatchObject({
      archivedAt: "2026-03-02T00:00:00.000Z",
      autoArchivedChangeRequestUrl: "https://github.com/acme/repo/pull/123",
    });
  });

  test("composes concurrent workspace field updates without losing either change", async () => {
    await workspaceRegistry.initialize();
    await workspaceRegistry.upsert(
      createPersistedWorkspaceRecord({
        workspaceId: "ws-1",
        projectId: "proj-1",
        cwd: "/tmp/repo",
        kind: "local_checkout",
        displayName: "main",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    await Promise.all([
      workspaceRegistry.update("ws-1", (record) => ({
        ...record,
        title: "Payments work",
        updatedAt: "2026-03-02T00:00:00.000Z",
      })),
      workspaceRegistry.update("ws-1", (record) => ({
        ...record,
        pinnedAt: "2026-03-03T00:00:00.000Z",
        updatedAt: "2026-03-03T00:00:00.000Z",
      })),
    ]);

    const reloadedRegistry = new FileBackedWorkspaceRegistry(
      path.join(tmpDir, "projects", "workspaces.json"),
      logger,
    );
    await reloadedRegistry.initialize();
    expect(await reloadedRegistry.get("ws-1")).toMatchObject({
      title: "Payments work",
      pinnedAt: "2026-03-03T00:00:00.000Z",
    });
  });
});

describe("project groups", () => {
  let home: string;
  const logger = createTestLogger();
  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), "project-grouping-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });
  function registry() {
    return new FileBackedProjectRegistry(path.join(home, "projects", "projects.json"), logger, {
      paseoHome: home,
    });
  }
  function record(id: string, customName: string | null = null) {
    const rootPath = path.join(home, id);
    mkdirSync(rootPath, { recursive: true });
    return createPersistedProjectRecord({
      projectId: id,
      rootPath,
      kind: "git",
      displayName: id,
      customName,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      projectKey: `remote:github.com/BlackHubTechnologies/${id}`,
    });
  }
  test("first matching path/owner rule wins and sibling paths/owners are negative controls", () => {
    const rules: ProjectGroupRule[] = [
      {
        id: "platform",
        group: INITIAL_PROJECT_GROUPS[1],
        match: { kind: "path", prefix: "~/Work/Platform/**" },
      },
      {
        id: "company",
        group: INITIAL_PROJECT_GROUPS[0],
        match: { kind: "remote_owner", owner: "BlackHubTechnologies/*" },
      },
    ];
    expect(
      resolveProjectGroup({
        project: {
          rootPath: "/home/teo/Work/Platform/repo",
          projectKey: "remote:github.com/blackhubtechnologies/repo",
        },
        rules,
        home: "/home/teo",
      })?.name,
    ).toBe("Nexus Platform");
    expect(
      resolveProjectGroup({
        project: {
          rootPath: "/home/teo/Work/Platform-other/repo",
          projectKey: "remote:github.com/blackhubtechnologies/repo",
        },
        rules,
        home: "/home/teo",
      })?.name,
    ).toBe("BlackForge");
    expect(
      resolveProjectGroup({
        project: {
          rootPath: "/home/teo/Work/Platform-other/repo",
          projectKey: "remote:github.com/blackhubtechnologies-other/repo",
        },
        rules,
        home: "/home/teo",
      }),
    ).toBeNull();
    expect(
      resolveProjectGroup({
        project: { rootPath: "/home/teo/Work/Platform", projectKey: null },
        rules,
        home: "/home/teo",
      })?.name,
    ).toBe("Nexus Platform");
  });
  test("bf platform classification uses remote repository identity even in arbitrary checkout names", () => {
    const rules: ProjectGroupRule[] = [
      {
        id: "platform",
        group: INITIAL_PROJECT_GROUPS[1],
        match: { kind: "remote_repository", prefix: "bf-" },
      },
    ];
    expect(
      resolveProjectGroup({
        project: {
          rootPath: "/reviews/final",
          projectKey: "remote:github.com/blackhubtechnologies/bf-model-serving",
        },
        rules,
      })?.name,
    ).toBe("Nexus Platform");
    expect(
      resolveProjectGroup({
        project: {
          rootPath: "/bf-model-serving",
          projectKey: "remote:github.com/blackhubtechnologies/company-site",
        },
        rules,
      }),
    ).toBeNull();
  });
  test("legacy records stay ungrouped and manual assignments survive persistence and rule changes", async () => {
    const projects = registry();
    await projects.upsert(record("repo"));
    expect((await projects.get("repo"))?.group).toBeUndefined();
    await projects.upsert({ ...record("control"), projectKey: "remote:github.com/other/repo" });
    const automatic = await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "rule_add",
        rule: {
          id: "owner",
          group: INITIAL_PROJECT_GROUPS[0],
          match: { kind: "remote_owner", owner: "blackhubtechnologies" },
        },
      },
    });
    expect(automatic.changedProjects.map((project) => project.projectId)).toEqual(["repo"]);
    expect((await projects.get("control"))?.group).toBeUndefined();
    expect((await projects.get("repo"))?.group?.name).toBe("BlackForge");
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "set",
        projectId: "repo",
        group: { name: "Fleet tooling", order: 3, collapsed: true },
      },
    });
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "rule_remove", id: "owner" },
    });
    const reopened = registry();
    await reopened.initialize();
    expect((await reopened.get("repo"))?.group).toEqual({
      name: "Fleet tooling",
      order: 3,
      collapsed: true,
    });
    await projectGroupOperation({
      projects: reopened,
      paseoHome: home,
      operation: { kind: "unset", projectId: "repo" },
    });
    await projectGroupOperation({
      projects: reopened,
      paseoHome: home,
      operation: {
        kind: "rule_add",
        rule: {
          id: "owner",
          group: INITIAL_PROJECT_GROUPS[0],
          match: { kind: "remote_owner", owner: "blackhubtechnologies" },
        },
      },
    });
    expect((await reopened.get("repo"))?.group).toBeNull();
    const added = await reopened.getOrCreateActiveByRoot({
      rootPath: path.join(home, "review11"),
      kind: "git",
      displayName: "review11",
      projectKey: "remote:github.com/blackhubtechnologies/new-repo",
      timestamp: "2026-10-11T00:00:00Z",
    });
    expect(added.group?.name).toBe("BlackForge");
    const config = JSON.parse(readFileSync(path.join(home, "config.json"), "utf8"));
    expect(config.projectGrouping.rules[0].id).toBe("owner");
  });
  test("removing a rule clears automatic placement, duplicate/missing rules reject, concurrent writes retain unrelated fields", async () => {
    const projects = registry();
    await projects.upsert(record("repo"));
    const rule: ProjectGroupRule = {
      id: "owner",
      group: INITIAL_PROJECT_GROUPS[0],
      match: { kind: "remote_owner", owner: "blackhubtechnologies" },
    };
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "rule_add", rule },
    });
    await expect(
      projectGroupOperation({ projects, paseoHome: home, operation: { kind: "rule_add", rule } }),
    ).rejects.toThrow("already exists");
    await Promise.all([
      projectGroupOperation({
        projects,
        paseoHome: home,
        operation: { kind: "rule_remove", id: "owner" },
      }),
      projects.update("repo", (current) => ({ ...current, customName: "Kept name" })),
    ]);
    expect(await projects.get("repo")).toMatchObject({ group: null, customName: "Kept name" });
    await expect(
      projectGroupOperation({
        projects,
        paseoHome: home,
        operation: { kind: "rule_remove", id: "owner" },
      }),
    ).rejects.toThrow("Rule not found");
  });
  test("stale git snapshots preserve manual set/unset while automatic placement follows changed identity", async () => {
    const projects = registry();
    await projects.upsert(record("repo"));
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "rule_add",
        rule: {
          id: "owner",
          group: INITIAL_PROJECT_GROUPS[0],
          match: { kind: "remote_owner", owner: "blackhubtechnologies" },
        },
      },
    });
    const stale = (await projects.get("repo"))!;
    expect(stale.groupSource).toBe("rule");
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "set", projectId: "repo", group: INITIAL_PROJECT_GROUPS[2] },
    });
    await projects.upsert({ ...stale, projectKey: "remote:github.com/other/repo" });
    expect(await projects.get("repo")).toMatchObject({
      group: INITIAL_PROJECT_GROUPS[2],
      groupSource: "manual",
      projectKey: "remote:github.com/other/repo",
    });
    const beforeUnset = (await projects.get("repo"))!;
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "unset", projectId: "repo" },
    });
    await projects.upsert({ ...beforeUnset, projectKey: stale.projectKey });
    expect(await projects.get("repo")).toMatchObject({ group: null, groupSource: "manual" });
    await projects.upsert(record("automatic"));
    const automatic = (await projects.get("automatic"))!;
    expect(automatic.group?.name).toBe("BlackForge");
    await projects.upsert({ ...automatic, projectKey: "remote:github.com/other/automatic" });
    expect((await projects.get("automatic"))?.group).toBeNull();
    const reopened = registry();
    await reopened.initialize();
    expect(await reopened.get("repo")).toMatchObject({ group: null, groupSource: "manual" });
  });
  test("same-name defaults persist as one catalog and metadata changes update every member and rule", async () => {
    const projects = registry();
    for (const id of ["a", "b", "automatic"]) await projects.upsert(record(id));
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "set",
        projectId: "a",
        group: { name: "Fleet tooling", order: 2, collapsed: true },
      },
    });
    const changed = await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "set",
        projectId: "b",
        group: { name: "Fleet tooling", order: 0, collapsed: false },
      },
    });
    expect(changed.changedProjects.map((project) => project.projectId).sort()).toEqual(["a", "b"]);
    for (const id of ["a", "b"])
      expect((await projects.get(id))?.group).toEqual({
        name: "Fleet tooling",
        order: 0,
        collapsed: false,
      });
    const rule = {
      id: "fleet",
      group: { name: "Fleet tooling", order: 3, collapsed: true },
      match: { kind: "remote_owner" as const, owner: "blackhubtechnologies" },
    };
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "rule_add", rule },
    });
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "unset", projectId: "a" },
    });
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "set",
        projectId: "b",
        group: { name: "Fleet tooling", order: 4, collapsed: false },
      },
    });
    const reopened = registry();
    await reopened.initialize();
    expect((await reopened.get("a"))?.group).toBeNull();
    for (const id of ["b", "automatic"])
      expect((await reopened.get(id))?.group).toEqual({
        name: "Fleet tooling",
        order: 4,
        collapsed: false,
      });
    const listing = await projectGroupOperation({
      projects: reopened,
      paseoHome: home,
      operation: { kind: "list" },
    });
    expect(listing.groups.find((group) => group.name === "Fleet tooling")).toEqual({
      name: "Fleet tooling",
      order: 4,
      collapsed: false,
    });
    expect(listing.rules[0].group).toEqual({ name: "Fleet tooling", order: 4, collapsed: false });
  });
  test("queued assignments inherit the latest defaults when CLI flags are omitted", async () => {
    const projects = registry();
    for (const id of ["a", "b"]) await projects.upsert(record(id));
    const implicit = ProjectGroupOperationSchema.parse({
      kind: "set",
      projectId: "a",
      group: { name: "Fleet tooling" },
    });
    expect(implicit).toEqual({ kind: "set", projectId: "a", group: { name: "Fleet tooling" } });
    await Promise.all([
      projectGroupOperation({
        projects,
        paseoHome: home,
        operation: {
          kind: "set",
          projectId: "b",
          group: { name: "Fleet tooling", order: 7, collapsed: true },
        },
      }),
      projectGroupOperation({ projects, paseoHome: home, operation: implicit }),
    ]);
    for (const id of ["a", "b"])
      expect((await projects.get(id))?.group).toEqual({
        name: "Fleet tooling",
        order: 7,
        collapsed: true,
      });
    await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: {
        kind: "rule_add",
        rule: {
          id: "inherit",
          group: { name: "Fleet tooling" },
          match: { kind: "remote_owner", owner: "other" },
        },
      },
    });
    const listing = await projectGroupOperation({
      projects,
      paseoHome: home,
      operation: { kind: "list" },
    });
    expect(listing.rules[0].group).toEqual({ name: "Fleet tooling", order: 7, collapsed: true });
  });
  test("TSV-backed migration preserves custom base names, respects root/id/action guards and is idempotent", async () => {
    const projects = registry();
    const eligible = record("bf-api-gateway", "BlackForge / Payments gateway");
    const company = record("company-site", "BlackForge / Company site");
    const unbacked = record("unbacked", "BlackForge / User's chosen name");
    const moved = record("moved", "Fleet tooling / Kept");
    for (const project of [eligible, company, unbacked, moved]) await projects.upsert(project);
    const mapping = `path\tgroup\tproject\thost\tproject_id\taction\trule\n${eligible.rootPath}\tBlackForge\tbf-api-gateway\tm5\tbf-api-gateway\trename\tapproved\n${company.rootPath}\tBlackForge\tcompany-site\tm5\tcompany-site\trename\tapproved\n${eligible.rootPath}\tFleet tooling\tmoved\tm5\tmoved\trename\tapproved\n${unbacked.rootPath}\tBlackForge\tunbacked\tm5\tunbacked\thold\tunknown`;
    expect(await migrateProjectGroupPrefixes({ projects, mapping })).toEqual([
      "bf-api-gateway",
      "company-site",
    ]);
    expect(await projects.get("bf-api-gateway")).toMatchObject({
      customName: "Payments gateway",
      displayName: "bf-api-gateway",
      rootPath: eligible.rootPath,
      group: { name: "Nexus Platform" },
    });
    expect(await projects.get("company-site")).toMatchObject({
      customName: "Company site",
      group: { name: "BlackForge" },
    });
    expect(await projects.get("unbacked")).toMatchObject({
      customName: "BlackForge / User's chosen name",
    });
    expect(await projects.get("moved")).toMatchObject({ customName: "Fleet tooling / Kept" });
    expect(await migrateProjectGroupPrefixes({ projects, mapping })).toEqual([]);
    expect(
      JSON.parse(readFileSync(path.join(home, "projects", "projects.json"), "utf8")),
    ).toHaveLength(4);
  });
  test("daemon startup automatically consumes the reviewed mapping when present", async () => {
    const projects = registry();
    const project = record("company-site", "BlackForge / Site");
    await projects.upsert(project);
    mkdirSync(path.join(home, "ops-scratch", "ws-clean"), { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      path.join(home, "ops-scratch", "ws-clean", "grouping.tsv"),
      `path\tgroup\tproject_id\taction\n${project.rootPath}\tBlackForge\tcompany-site\trename`,
    );
    const restarted = registry();
    await restarted.initialize();
    expect(await restarted.get("company-site")).toMatchObject({
      customName: "Site",
      group: { name: "BlackForge" },
    });
  });
});
