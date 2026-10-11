#!/usr/bin/env python3
"""Re-home linked worktree records under their git-common-dir project.

Dry-run by default. Apply only after duplicate workspace records are repaired.
The daemon's workspace-create path performs the persistent re-home; this tool
checks that it reused the same workspace ID and removes only empty legacy
worktree project rows after verifying no active record still references them.
"""

import argparse
import collections
import json
import os
from pathlib import Path
import subprocess
import sys


def command(*args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}): {args[0]} {args[1] if len(args)>1 else ''}: {result.stderr.strip()[:300]}")
    return result.stdout.strip()


def cli(*args):
    return json.loads(command("paseo", *args, "--json"))


def records(home):
    workspaces = json.loads((home / "projects/workspaces.json").read_text())
    projects = json.loads((home / "projects/projects.json").read_text())
    return {w["workspaceId"]: w for w in workspaces}, {p["projectId"]: p for p in projects}


def origin(cwd):
    result = subprocess.run(["git", "-C", str(cwd), "remote", "get-url", "origin"], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def linked_owner(cwd, project, projects):
    # A .git file at the checkout root distinguishes a linked worktree from a
    # main checkout, including workspace cwds inside the linked worktree.
    checkout_root = next((parent for parent in (cwd, *cwd.parents) if (parent / ".git").exists()), None)
    if checkout_root is None:
        return None
    if (checkout_root / ".git").is_dir():
        # A standalone review clone has its own common dir. The persisted
        # remote key narrows candidates, and Git's actual origin must agree.
        key = project.get("projectKey")
        remote = origin(cwd)
        if not key or not key.startswith("remote:") or not remote:
            return None
        candidates = [
            Path(other["rootPath"]).resolve()
            for other in projects.values()
            if not other.get("archivedAt") and other["projectId"] != project["projectId"]
            and other.get("projectKey") == key
            and (Path(other["rootPath"]) / ".git").is_dir()
            and origin(Path(other["rootPath"])) == remote
        ]
        ranked = sorted([checkout_root.resolve(), *candidates], key=lambda p: (len(p.parts), len(str(p)), str(p)))
        return ranked[0] if ranked[0] != checkout_root.resolve() else None
    if not (checkout_root / ".git").is_file():
        return None
    lines = command("git", "-C", str(cwd), "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel").splitlines()
    if len(lines) != 2:
        raise RuntimeError(f"unexpected git common-dir output for {cwd}")
    common = Path(lines[0]).resolve()
    top = Path(lines[1]).resolve()
    owner = common.parent if common.name == ".git" else None
    if owner is None or top != checkout_root.resolve() or not (owner / ".git").is_dir():
        raise RuntimeError(f"unresolved linked worktree owner: {cwd}")
    if owner == cwd.resolve():
        return None
    # Both checkouts must use the same Git configuration and origin. Never
    # print the remote; URLs may contain credentials.
    if origin(cwd) != origin(owner):
        raise RuntimeError(f"linked worktree remote differs from owner: {cwd}")
    return owner


def plan(home):
    active = cli("workspace", "ls")
    by_id, projects = records(home)
    by_path = collections.Counter(os.path.realpath(os.path.expanduser(w["cwd"])) for w in active)
    actions = []
    skipped = []
    for row in active:
        workspace = by_id.get(row["workspaceId"])
        if not workspace or workspace.get("archivedAt"):
            raise RuntimeError(f"workspace inventory changed: {row['workspaceId']}")
        cwd = Path(os.path.expanduser(workspace["cwd"]))
        if not cwd.is_dir():
            continue
        if by_path[os.path.realpath(cwd)] != 1:
            skipped.append({"workspaceId": row["workspaceId"], "reason": "duplicate_path"})
            continue
        project = projects.get(workspace["projectId"])
        if not project:
            skipped.append({"workspaceId": row["workspaceId"], "reason": "missing_project"})
            continue
        try:
            owner = linked_owner(cwd, project, projects)
        except RuntimeError:
            skipped.append({"workspaceId": row["workspaceId"], "reason": "invalid_or_ambiguous_git_metadata", "cwd": str(cwd)})
            continue
        if owner is None:
            continue
        if os.path.realpath(project["rootPath"]) == os.path.realpath(owner):
            continue
        actions.append({"workspaceId": row["workspaceId"], "cwd": str(cwd),
                        "oldProjectId": project["projectId"], "oldProjectRoot": project["rootPath"],
                        "ownerRoot": str(owner)})
    return {"active": len(active), "actions": actions, "skipped": skipped}


def apply_one(home, item):
    current = plan(home)
    if item not in current["actions"]:
        return {**item, "result": "skipped_revalidation_changed"}
    created = cli("workspace", "create", "--isolation", "local", "--path", item["cwd"])
    if created.get("workspaceId") != item["workspaceId"]:
        raise RuntimeError(f"workspace create did not reuse {item['workspaceId']}")
    by_id, projects = records(home)
    workspace = by_id[item["workspaceId"]]
    new_project = projects.get(workspace["projectId"])
    if not new_project or os.path.realpath(new_project["rootPath"]) != os.path.realpath(item["ownerRoot"]):
        raise RuntimeError(f"project re-home failed for {item['workspaceId']}")
    if workspace["projectId"] == item["oldProjectId"]:
        raise RuntimeError(f"project id did not change for {item['workspaceId']}")
    old_project = projects.get(item["oldProjectId"])
    if old_project and linked_owner(Path(old_project["rootPath"]), old_project, projects) == Path(item["ownerRoot"]):
        if any(w["projectId"] == item["oldProjectId"] for w in by_id.values()):
            return {**item, "newProjectId": workspace["projectId"], "result": "rehomed_old_project_still_used"}
        cli("project", "delete", item["oldProjectId"], "--if-empty")
        _, after_projects = records(home)
        if item["oldProjectId"] in after_projects:
            raise RuntimeError(f"empty legacy project was not removed: {item['oldProjectId']}")
    return {**item, "newProjectId": workspace["projectId"], "result": "rehomed"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home() / ".paseo")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--guard-verified", action="store_true", help="Required for --apply after patched daemon verification")
    args = parser.parse_args()
    if args.apply and not args.guard_verified:
        raise RuntimeError("--apply requires --guard-verified on the patched daemon")
    before = plan(args.home)
    output = {"mode": "apply" if args.apply else "dry-run", "before": before}
    if args.apply:
        output["results"] = []
        for item in before["actions"]:
            try:
                result = apply_one(args.home, item)
            except Exception as error:
                result = {**item, "result": "failed", "error": str(error)}
            output["results"].append(result)
            print(json.dumps(result), file=sys.stderr, flush=True)
        output["after"] = plan(args.home)
    print(json.dumps(output, indent=2))
    return int(args.apply and any(r["result"] == "failed" for r in output["results"]))


if __name__ == "__main__":
    sys.exit(main())
