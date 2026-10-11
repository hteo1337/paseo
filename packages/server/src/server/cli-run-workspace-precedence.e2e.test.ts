import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DaemonClient } from "./test-utils/index.js";
import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";
import { getFullAccessConfig } from "./daemon-e2e/agent-configs.js";
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";

// The daemon-level workspace contract that `paseo run` depends on: each
// local-backed createWorkspace for a cwd reuses its active workspace,
// createAgent stamps the agent with the workspaceId it is given, and attaching
// to an existing workspace by id creates no new record. The CLI's own flag
// precedence (--workspace > $PASEO_WORKSPACE_ID > --worktree > bare) is covered
// in packages/cli/src/commands/agent/run.test.ts; this test only proves the
// daemon behaviors the CLI builds on.

async function workspaceIds(client: DaemonClient): Promise<Set<string>> {
  const workspaces = await client.fetchWorkspaces();
  return new Set(workspaces.entries.map((entry) => entry.id));
}

async function mintLocalWorkspace(client: DaemonClient, cwd: string): Promise<string> {
  const result = await client.createWorkspace({ source: { kind: "directory", path: cwd } });
  if (!result.workspace) {
    throw new Error(result.error ?? "Failed to create workspace");
  }
  return result.workspace.id;
}

test("daemon resolves human and managed CLI workspace ownership", async () => {
  const daemon = await createTestPaseoDaemon();
  const cwd = mkdtempSync(path.join(tmpdir(), "paseo-cli-run-cwd-"));
  const otherCwd = mkdtempSync(path.join(tmpdir(), "paseo-cli-run-other-cwd-"));
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.1.82",
  });

  try {
    await client.connect();
    await client.fetchAgents({ subscribe: {} });

    // A bare run resolves a local workspace for the cwd, then the agent is
    // stamped with that workspace's id.
    const firstWorkspaceId = await mintLocalWorkspace(client, cwd);

    const firstAgent = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd,
      workspaceId: firstWorkspaceId,
      title: "First run agent",
    });
    expect(firstAgent.workspaceId).toBe(firstWorkspaceId);
    expect(await workspaceIds(client)).toContain(firstWorkspaceId);

    const fetchedFirst = await client.fetchAgent({ agentId: firstAgent.id });
    expect(fetchedFirst?.agent.workspaceId).toBe(firstWorkspaceId);

    const idsBeforeSameCwdRun = await workspaceIds(client);
    const repeatedWorkspaceId = await mintLocalWorkspace(client, cwd);
    expect(repeatedWorkspaceId).toBe(firstWorkspaceId);
    const repeatedAgent = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd,
      workspaceId: repeatedWorkspaceId,
      title: "Repeated cwd run agent",
    });
    expect(repeatedAgent.workspaceId).toBe(firstWorkspaceId);
    expect(await workspaceIds(client)).toEqual(idsBeforeSameCwdRun);

    // A different cwd gets a distinct workspace with its own authoritative cwd.
    const secondWorkspaceId = await mintLocalWorkspace(client, otherCwd);
    expect(secondWorkspaceId).not.toBe(firstWorkspaceId);

    const secondAgent = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd: otherCwd,
      workspaceId: secondWorkspaceId,
      title: "Second run agent",
    });
    expect(secondAgent.workspaceId).toBe(secondWorkspaceId);
    expect(secondAgent.workspaceId).not.toBe(firstAgent.workspaceId);

    const idsAfterTwoMints = await workspaceIds(client);
    expect(idsAfterTwoMints).toContain(firstWorkspaceId);
    expect(idsAfterTwoMints).toContain(secondWorkspaceId);

    // Attaching to an existing workspace by id (how --workspace and
    // $PASEO_WORKSPACE_ID land a run) creates no new workspace record: the
    // agent lands in the named workspace and the workspace set is unchanged.
    const idsBeforeAttach = await workspaceIds(client);
    const attachedAgent = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd: path.join(otherCwd, "stale-client-directory"),
      workspaceId: firstWorkspaceId,
      title: "Attached agent",
    });
    expect(attachedAgent.workspaceId).toBe(firstWorkspaceId);
    expect(attachedAgent.cwd).toBe(cwd);
    expect(await workspaceIds(client)).toEqual(idsBeforeAttach);

    await expect(
      client.createAgent({
        ...getFullAccessConfig("codex"),
        cwd,
        workspaceId: "wks_missing",
        title: "Missing workspace agent",
      }),
    ).rejects.toThrow("Workspace wks_missing not found");

    const sameWorkspaceChild = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd: otherCwd,
      callerAgentId: firstAgent.id,
      title: "Same workspace child",
    });
    expect(sameWorkspaceChild.workspaceId).toBe(firstWorkspaceId);
    expect(sameWorkspaceChild.cwd).toBe(firstAgent.cwd);
    expect(sameWorkspaceChild.labels[PARENT_AGENT_ID_LABEL]).toBe(firstAgent.id);
    expect(await workspaceIds(client)).toEqual(idsBeforeAttach);

    const crossWorkspaceChild = await client.createAgent({
      ...getFullAccessConfig("codex"),
      cwd,
      workspaceId: secondWorkspaceId,
      callerAgentId: firstAgent.id,
      title: "Cross workspace child",
    });
    expect(crossWorkspaceChild.workspaceId).toBe(secondWorkspaceId);
    expect(crossWorkspaceChild.cwd).toBe(otherCwd);
    expect(crossWorkspaceChild.labels[PARENT_AGENT_ID_LABEL]).toBe(firstAgent.id);
  } finally {
    await client.close().catch(() => undefined);
    await daemon.close();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(otherCwd, { recursive: true, force: true });
  }
}, 180000);

test("project grouping CLI and real git paths preserve one repository owner", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "paseo-group-real-")));
  const repo = path.join(root, "repo");
  const linked = path.join(root, "feat-any-name");
  const clone = path.join(root, "reviews", "final");
  const other = path.join(root, "different", "final");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });
  mkdirSync(repo);
  git(repo, "-c", "init.defaultBranch=main", "init");
  writeFileSync(path.join(repo, "marker.txt"), "kept\n");
  git(repo, "add", "marker.txt");
  git(
    repo,
    "-c",
    "user.name=Grouping Test",
    "-c",
    "user.email=grouping@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  git(repo, "remote", "add", "origin", "https://github.com/BlackHubTechnologies/bf-fixture.git");
  git(repo, "worktree", "add", "-b", "feature", linked);
  mkdirSync(path.dirname(clone), { recursive: true });
  git(root, "clone", repo, clone);
  git(clone, "remote", "set-url", "origin", "git@github.com:BlackHubTechnologies/bf-fixture.git");
  mkdirSync(path.dirname(other), { recursive: true });
  git(root, "clone", repo, other);
  git(
    other,
    "remote",
    "set-url",
    "origin",
    "https://github.com/BlackHubTechnologies/company-fixture.git",
  );
  expect(git(linked, "rev-parse", "--git-common-dir").trim()).not.toBe(
    git(other, "rev-parse", "--git-common-dir").trim(),
  );
  expect(git(clone, "remote", "get-url", "origin").trim()).not.toBe(
    git(other, "remote", "get-url", "origin").trim(),
  );
  const daemon = await createTestPaseoDaemon();
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.11.2",
  });
  const runCli = async (...args: string[]) => {
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.resolve(__dirname, "../../../cli/dist/index.js"),
        "--host",
        `127.0.0.1:${daemon.port}`,
        "--json",
        ...args,
      ],
      {
        env: {
          ...process.env,
          PASEO_HOME: daemon.paseoHome,
          PASEO_PASSWORD: "",
          PASEO_AGENT_ID: "",
          PASEO_WORKSPACE_ID: "",
          PASEO_HOST: "",
        },
        timeout: 30_000,
      },
    );
    return JSON.parse(result.stdout);
  };
  try {
    await client.connect();
    await client.fetchAgents({ subscribe: {} });
    const main = await client.createWorkspace({ source: { kind: "directory", path: repo } });
    expect(main.error).toBeNull();
    expect(main.workspace?.projectGroup).toBeUndefined();
    await runCli(
      "project",
      "group",
      "rule",
      "add",
      "platform",
      "Nexus Platform",
      "--repo-prefix",
      "bf-",
      "--order",
      "1",
    );
    await runCli(
      "project",
      "group",
      "rule",
      "add",
      "company",
      "BlackForge",
      "--owner",
      "BlackHubTechnologies",
    );
    const worktree = await client.createWorkspace({ source: { kind: "directory", path: linked } });
    const review = await client.createWorkspace({ source: { kind: "directory", path: clone } });
    const control = await client.createWorkspace({ source: { kind: "directory", path: other } });
    expect(worktree.workspace?.projectId).toBe(main.workspace?.projectId);
    expect(review.workspace?.projectId).toBe(main.workspace?.projectId);
    expect(control.workspace?.projectId).not.toBe(main.workspace?.projectId);
    expect(worktree.workspace?.projectGroup?.name).toBe("Nexus Platform");
    expect(review.workspace?.projectGroup?.name).toBe("Nexus Platform");
    expect(control.workspace?.projectGroup?.name).toBe("BlackForge");
    const grouped = await runCli("workspace", "ls", "--group", "Nexus Platform");
    expect(grouped).toHaveLength(3);
    expect(grouped.map((workspace: { cwd: string }) => workspace.cwd).sort()).toEqual(
      [repo, linked, clone].sort(),
    );
    expect(
      grouped.every(
        (workspace: { group: { name: string } }) => workspace.group.name === "Nexus Platform",
      ),
    ).toBe(true);
    expect(await runCli("workspace", "ls", "--group", "No such group")).toEqual([]);
    const projectId = main.workspace!.projectId;
    await client.fetchWorkspaces({ subscribe: {} });
    const updates = new Map<string, string | null>();
    const stopUpdates = client.on("workspace_update", (message) => {
      if (message.payload.kind === "upsert")
        updates.set(
          message.payload.workspace.id,
          message.payload.workspace.projectGroup?.name ?? null,
        );
    });
    await runCli(
      "project",
      "group",
      "set",
      projectId,
      "Fleet tooling",
      "--order",
      "2",
      "--collapsed",
    );
    await expect
      .poll(() => updates.get(main.workspace!.id), { timeout: 5000 })
      .toBe("Fleet tooling");
    expect(updates.get(control.workspace!.id)).not.toBe("Fleet tooling");
    const manuallyGrouped = await runCli("project", "ls");
    expect(
      manuallyGrouped.find((project: { projectId: string }) => project.projectId === projectId)
        .group,
    ).toEqual({ name: "Fleet tooling", order: 2, collapsed: true });
    await runCli("project", "group", "set", control.workspace!.projectId, "Fleet tooling");
    const defaulted = await runCli("project", "ls");
    expect(
      defaulted.find(
        (project: { projectId: string }) => project.projectId === control.workspace!.projectId,
      ).group,
    ).toEqual({ name: "Fleet tooling", order: 2, collapsed: true });
    await runCli("project", "group", "set", projectId, "Fleet tooling", "--expanded");
    const expanded = await runCli("project", "ls");
    expect(
      expanded
        .filter(
          (project: { group: { name: string } | null }) => project.group?.name === "Fleet tooling",
        )
        .every((project: { group: { collapsed: boolean } }) => project.group.collapsed === false),
    ).toBe(true);
    await runCli("project", "group", "unset", control.workspace!.projectId);
    await runCli("project", "group", "unset", projectId);
    await expect.poll(() => updates.get(main.workspace!.id), { timeout: 5000 }).toBeNull();
    stopUpdates();
    expect(await runCli("workspace", "ls", "--group", "Fleet tooling")).toEqual([]);
    await runCli("project", "group", "rule", "rm", "company");
    const groups = await runCli("project", "group", "ls");
    expect(
      groups.find((group: { name: string }) => group.name === "Nexus Platform").rules[0].id,
    ).toBe("platform");
    expect(
      JSON.parse(readFileSync(path.join(daemon.paseoHome, "config.json"), "utf8")).projectGrouping
        .rules,
    ).toHaveLength(1);
    expect(readFileSync(path.join(repo, "marker.txt"), "utf8")).toBe("kept\n");
  } finally {
    await client.close().catch(() => undefined);
    await daemon.close();
    rmSync(root, { recursive: true, force: true });
  }
}, 180_000);
