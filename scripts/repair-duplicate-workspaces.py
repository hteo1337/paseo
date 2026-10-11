#!/usr/bin/env python3
"""One-time, host-local duplicate workspace repair. Dry run unless --apply.

Uses Paseo's own archive RPC only after rechecking the active agent roster.
Groups with more than one live owner are left for explicit reassignment.
"""
import argparse
import collections
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import subprocess
import sys

LIVE = {"running", "idle"}


def cli(*args):
    result = subprocess.run(["paseo", *args, "--json"], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"paseo {' '.join(args)} failed ({result.returncode}): {result.stderr.strip()[:400]}")
    return json.loads(result.stdout)


def inventory(home):
    active = cli("workspace", "ls")
    agents = cli("agent", "ls", "--global")
    stored = json.loads((home / "projects/workspaces.json").read_text())
    by_id = {record["workspaceId"]: record for record in stored}
    if len(by_id) != len(stored):
        raise RuntimeError("duplicate workspace IDs in persistent store")
    live = {agent["id"]: agent for agent in agents if agent.get("status") in LIVE}
    owners = collections.defaultdict(set)
    found = set()
    if live:
        for path in (home / "agents").glob("*/*.json"):
            if path.stem not in live:
                continue
            record = json.loads(path.read_text())
            if record.get("id") != path.stem or record.get("archivedAt"):
                raise RuntimeError(f"live agent record mismatch: {path}")
            found.add(path.stem)
            if not record.get("workspaceId"):
                raise RuntimeError(f"live agent missing workspaceId: {path.stem}")
            owners[record["workspaceId"]].add(path.stem)
        if found != live.keys():
            raise RuntimeError(f"missing stored records for live agents: {sorted(live.keys() - found)}")
    groups = collections.defaultdict(list)
    for row in active:
        wid = row["workspaceId"]
        record = by_id.get(wid)
        if not record or record.get("archivedAt") or record.get("cwd") != row.get("cwd"):
            raise RuntimeError(f"active workspace/store mismatch: {wid}")
        cwd = Path(os.path.expanduser(row["cwd"]))
        key = os.path.realpath(cwd)
        groups[key].append(record)
    return active, groups, owners


def plan(home):
    active, groups, owners = inventory(home)
    candidates = []
    skipped = []
    duplicate_groups = 0
    for realpath, records in sorted(groups.items()):
        if len(records) < 2:
            continue
        duplicate_groups += 1
        live_owners = [r for r in records if owners[r["workspaceId"]]]
        if len(live_owners) > 1:
            skipped.append({"path": realpath, "reason": "multiple_live_owners", "ids": [r["workspaceId"] for r in live_owners]})
            continue
        keeper = live_owners[0] if live_owners else max(records, key=lambda r: (r["createdAt"], r["workspaceId"]))
        for record in records:
            if record["workspaceId"] != keeper["workspaceId"]:
                candidates.append({"path": realpath, "keeper": keeper["workspaceId"], "retire": record["workspaceId"], "directoryExists": Path(realpath).is_dir()})
    return {"active": len(active), "uniquePaths": len(groups), "duplicateGroups": duplicate_groups,
            "extraRecords": len(active) - len(groups), "candidates": candidates, "skipped": skipped}


def apply_one(home, item):
    current = plan(home)
    match = next((c for c in current["candidates"] if c["retire"] == item["retire"] and c["keeper"] == item["keeper"] and c["path"] == item["path"]), None)
    if not match:
        return {**item, "result": "skipped_revalidation_changed"}
    before_dir = Path(item["path"]).is_dir()
    try:
        result = cli("workspace", "archive", item["retire"])
    except RuntimeError as error:
        # The archive RPC can commit the registry mutation before the CLI's
        # 60-second response deadline. The fresh registry check below decides.
        if "DAEMON_REQUEST_TIMEOUT" not in str(error):
            raise
        result = {"status": "response_timeout; verifying committed state"}
    after = plan(home)
    active_ids = {row["workspaceId"] for row in cli("workspace", "ls")}
    if item["retire"] in active_ids or item["keeper"] not in active_ids:
        raise RuntimeError(f"archive postcondition failed for {item['retire']}")
    if before_dir and not Path(item["path"]).is_dir():
        raise RuntimeError(f"shared directory disappeared during archive: {item['path']}")
    return {**item, "result": "archived", "archiveResult": result, "activeAfter": after["active"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path.home() / ".paseo")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retire-id", help="Apply to one candidate, for a disposable proof")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--jobs", type=int, default=1, help="Bounded concurrent archive requests (default: 1)")
    args = parser.parse_args()
    before = plan(args.home)
    output = {"mode": "apply" if args.apply else "dry-run", "before": before}
    if args.apply:
        selected = [c for c in before["candidates"] if not args.retire_id or c["retire"] == args.retire_id]
        if args.retire_id and not selected:
            raise RuntimeError("requested retire ID is not a safe candidate")
        if args.limit is not None:
            selected = selected[:args.limit]
        output["results"] = []
        if args.jobs < 1 or args.jobs > 8:
            raise RuntimeError("--jobs must be between 1 and 8")
        def attempt(item):
            try:
                return apply_one(args.home, item)
            except Exception as error:
                return {**item, "result": "failed", "error": str(error)}
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = [pool.submit(attempt, item) for item in selected]
            for future in as_completed(futures):
                outcome = future.result()
                output["results"].append(outcome)
                print(json.dumps(outcome), flush=True, file=sys.stderr)
        output["after"] = plan(args.home)
    print(json.dumps(output, indent=2))
    if args.apply and any(r["result"] == "failed" for r in output["results"]):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
