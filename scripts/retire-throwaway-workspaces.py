#!/usr/bin/env python3
"""Retire explicitly approved scratch workspace records; dry-run by default.

Requires the patched daemon's --if-no-live-agents and --if-empty guards for
--apply. Never removes a directory. Eligible old scratch data is moved into
~/_to_delete after the record has been safely archived.
"""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def cli(*args):
    process = subprocess.run(["paseo", *args, "--json"], text=True, capture_output=True)
    if process.returncode:
        raise RuntimeError(f"paseo {' '.join(args)} failed ({process.returncode}): {process.stderr.strip()[:300]}")
    return json.loads(process.stdout)


def inside(path, root):
    return path != root and root in path.parents


def active_agents():
    return [agent for agent in cli("agent", "ls", "--global") if agent.get("status") != "closed"]


def has_live_agent(workspace_id, path, agents):
    for agent in agents:
        if agent.get("workspaceId") == workspace_id:
            return True
        cwd = agent.get("cwd")
        if cwd:
            agent_path = Path(os.path.realpath(os.path.expanduser(cwd)))
            if agent_path == path or path in agent_path.parents:
                return True
    return False


def approved_reason(path, home, include_sandbox):
    private_tmp = Path("/private/tmp")
    paseo = home / "Paseo"
    sandbox = paseo / "Sandbox"
    github = home / "Work/GitHub"
    projects = home / "Projects"
    keeper = home / ".hermes/keeper"
    candidates = keeper / "candidates"
    if inside(path, candidates):
        return "keeper_candidate"
    if path == home / "Library/Application Support/CodexBar/ClaudeProbe":
        return "codexbar_probe"
    if inside(path, sandbox):
        return "sandbox" if include_sandbox else None
    if path == paseo or inside(path, paseo) or path == projects or inside(path, projects):
        return None
    if path == github or inside(path, github):
        return None
    if path == home / ".claude-setup" or inside(path, home / ".claude-setup"):
        return None
    if path == keeper or inside(path, keeper):
        return None
    if not path.is_dir():
        return "missing_directory"
    if inside(path, private_tmp):
        return "private_tmp"
    if inside(path, home / ".hermes/cache/scratch"):
        return "hermes_scratch"
    if inside(path, home / ".hermes/keeper-canary-b"):
        return "keeper_canary"
    if inside(path, home / ".claude/state"):
        return "claude_state"
    if inside(path, home / "Work/Codex/2026-10-04"):
        return "codex_oct04"
    app_support = home / "Library/Application Support"
    if inside(path, app_support):
        parts = path.relative_to(app_support).parts
        if len(parts) >= 2 and parts[1].startswith("scratch"):
            return "app_support_scratch"
    worktrees = home / ".paseo/worktrees"
    if inside(path, worktrees) and not (path / ".git").exists() and not any(path.iterdir()):
        return "empty_worktree_container"
    return None


def newest_mtime(path):
    newest = path.stat().st_mtime
    for root, dirs, files in os.walk(path, followlinks=False):
        for name in dirs + files:
            entry = Path(root) / name
            try:
                newest = max(newest, entry.lstat().st_mtime)
            except FileNotFoundError:
                raise RuntimeError(f"directory changed during age check: {path}")
    return newest


def is_git_checkout(path):
    probe = subprocess.run(["git", "-C", str(path), "rev-parse", "--show-toplevel"], text=True, capture_output=True)
    return probe.returncode == 0 and os.path.realpath(probe.stdout.strip()) == os.path.realpath(path)


def has_nested_git_metadata(path):
    for root, dirs, files in os.walk(path, followlinks=False):
        if Path(root) != path and (".git" in dirs or ".git" in files):
            return True
        if ".git" in dirs:
            dirs.remove(".git")
    return False


def clean_and_fully_pushed(path):
    def git(*args):
        return subprocess.run(["git", "-C", str(path), *args], text=True, capture_output=True)

    status = git("status", "--porcelain=v1", "--untracked-files=all")
    branch = git("symbolic-ref", "-q", "HEAD")
    head = git("rev-parse", "HEAD")
    if status.returncode or status.stdout or branch.returncode or head.returncode:
        return False
    tracking = git("for-each-ref", "--format=%(upstream:remotename)%09%(upstream:remoteref)", branch.stdout.strip())
    if tracking.returncode or "\t" not in tracking.stdout:
        return False
    remote, ref = tracking.stdout.strip().split("\t", 1)
    if not remote or not ref:
        return False
    published = git("ls-remote", "--exit-code", "--heads", remote, ref)
    return published.returncode == 0 and published.stdout.split("\t", 1)[0] == head.stdout.strip()


def move_eligible(path, reason, trash):
    if not path.is_dir() or reason in {"missing_directory", "empty_worktree_container"}:
        return None
    if has_nested_git_metadata(path):
        return None
    if is_git_checkout(path):
        # A Git checkout moves only when clean and fully pushed to its upstream.
        if not clean_and_fully_pushed(path):
            return None
        destination = trash / f"{hashlib.sha256(str(path).encode()).hexdigest()[:12]}-{path.name}"
        if destination.exists():
            raise RuntimeError(f"trash destination already exists: {destination}")
        trash.mkdir(parents=True, exist_ok=True)
        if (path / ".git").is_file():
            result = subprocess.run(["git", "-C", str(path), "worktree", "move", str(path), str(destination)], text=True, capture_output=True)
            if result.returncode:
                raise RuntimeError(f"git worktree move failed: {path}: {result.stderr.strip()[:200]}")
        else:
            path.rename(destination)
        return str(destination)
    # A broken gitfile or a nested checkout still contains Git data. Without a
    # working repo identity, its clean/pushed state cannot be proved.
    if os.path.lexists(path / ".git"):
        return None
    # Only explicitly approved non-git scratch older than four full days.
    if reason not in {"private_tmp", "hermes_scratch", "keeper_canary", "keeper_candidate",
                      "app_support_scratch", "codexbar_probe", "claude_state", "codex_oct04", "sandbox"}:
        return None
    cutoff = (datetime.now(timezone.utc) - timedelta(days=4)).timestamp()
    if newest_mtime(path) >= cutoff:
        return None
    destination = trash / f"{hashlib.sha256(str(path).encode()).hexdigest()[:12]}-{path.name}"
    if destination.exists():
        raise RuntimeError(f"trash destination already exists: {destination}")
    trash.mkdir(parents=True, exist_ok=True)
    path.rename(destination)
    return str(destination)


def plan(home, include_sandbox):
    visible = cli("workspace", "ls")
    visible_ids = {row["workspaceId"] for row in visible}
    agents = active_agents()
    workspaces = {w["workspaceId"]: w for w in json.loads((home / ".paseo/projects/workspaces.json").read_text())}
    projects = {p["projectId"]: p for p in json.loads((home / ".paseo/projects/projects.json").read_text())}
    candidates, held = [], []
    for workspace in workspaces.values():
        if workspace.get("archivedAt"):
            continue
        path = Path(os.path.realpath(os.path.expanduser(workspace["cwd"])))
        reason = approved_reason(path, home, include_sandbox)
        if not reason:
            continue
        item = {"workspaceId": workspace["workspaceId"], "path": str(path), "reason": reason,
                "projectId": workspace["projectId"], "projectRoot": projects.get(workspace["projectId"], {}).get("rootPath")}
        if path.is_dir() and workspace["workspaceId"] not in visible_ids:
            held.append({**item, "hold": "active_store_not_visible"})
        elif has_live_agent(workspace["workspaceId"], path, agents):
            held.append({**item, "hold": "live_agent"})
        else:
            candidates.append(item)
    return {"visibleActive": len(visible), "storedActive": sum(not w.get("archivedAt") for w in workspaces.values()),
            "candidates": candidates, "held": held}


def apply_one(home, include_sandbox, item, trash):
    if item not in plan(home, include_sandbox)["candidates"]:
        return {**item, "result": "skipped_revalidation_changed"}
    path = Path(item["path"])
    directory_existed = path.is_dir()
    try:
        cli("workspace", "archive", item["workspaceId"], "--if-no-live-agents")
    except RuntimeError as error:
        if "DAEMON_REQUEST_TIMEOUT" not in str(error):
            raise
    stored = {w["workspaceId"]: w for w in json.loads((home / ".paseo/projects/workspaces.json").read_text())}
    if not stored.get(item["workspaceId"], {}).get("archivedAt"):
        raise RuntimeError(f"workspace still active after archive: {item['workspaceId']}")
    if directory_existed and not path.is_dir():
        raise RuntimeError(f"guarded archive removed a directory: {path}")
    return finalize_archived(home, include_sandbox, item, trash)


def finalize_archived(home, include_sandbox, item, trash):
    """Finish an archive and remove its project only through an atomic CLI guard."""
    path = Path(item["path"])
    if approved_reason(path, home, include_sandbox) != item["reason"]:
        raise RuntimeError(f"scratch classification changed: {path}")
    workspaces = json.loads((home / ".paseo/projects/workspaces.json").read_text())
    projects = {p["projectId"]: p for p in json.loads((home / ".paseo/projects/projects.json").read_text())}
    workspace = next((w for w in workspaces if w["workspaceId"] == item["workspaceId"]), None)
    if not workspace or not workspace.get("archivedAt") or workspace["projectId"] != item["projectId"]:
        raise RuntimeError(f"workspace not archived under expected project: {item['workspaceId']}")
    if any(not w.get("archivedAt") and w["projectId"] == item["projectId"] for w in workspaces):
        raise RuntimeError(f"project acquired an active workspace: {item['projectId']}")
    if has_live_agent(item["workspaceId"], path, active_agents()):
        raise RuntimeError(f"scratch path acquired a live agent: {path}")
    project = projects.get(item["projectId"])
    removed_project = False
    if project:
        if os.path.realpath(project["rootPath"]) != str(path):
            raise RuntimeError(f"project root differs from scratch path: {item['projectId']}")
        has_history = any(w["projectId"] == item["projectId"] for w in workspaces)
        cli("project", "delete", item["projectId"],
            "--if-no-active-workspaces" if has_history else "--if-empty")
        removed_project = True
    destination = move_eligible(path, item["reason"], trash)
    return {**{key: value for key, value in item.items() if key != "error"},
            "result": "archived", "projectRemoved": removed_project,
            "movedTo": destination}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-home", type=Path, default=Path.home())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--guard-verified", action="store_true", help="Required for --apply after a live-owner refusal probe on this daemon")
    parser.add_argument("--include-sandbox", action="store_true", help="Only after current sandbox work is finished")
    parser.add_argument("--resume-results", type=Path, help="Finish previously archived rows from an interrupted apply JSON")
    args = parser.parse_args()
    if args.apply and not args.guard_verified:
        raise RuntimeError("--apply requires --guard-verified after testing this daemon's live-owner refusal")
    before = plan(args.user_home, args.include_sandbox)
    output = {"mode": "apply" if args.apply else "dry-run", "before": before}
    resume = []
    if args.resume_results:
        previous = json.loads(args.resume_results.read_text())
        resume = [r for r in previous["results"] if r["result"] == "failed"]
        output["resumeCandidates"] = resume
    if args.apply:
        output["results"] = []
        trash = args.user_home / "_to_delete" / "TH1-630"
        for item in resume + before["candidates"]:
            try:
                result = (finalize_archived(args.user_home, args.include_sandbox, item, trash)
                          if item in resume else apply_one(args.user_home, args.include_sandbox, item, trash))
            except Exception as error:
                result = {**item, "result": "failed", "error": str(error)}
            output["results"].append(result)
            print(json.dumps(result), file=sys.stderr, flush=True)
        output["after"] = plan(args.user_home, args.include_sandbox)
    print(json.dumps(output, indent=2))
    return int(args.apply and any(r["result"] == "failed" for r in output["results"]))


if __name__ == "__main__":
    sys.exit(main())
