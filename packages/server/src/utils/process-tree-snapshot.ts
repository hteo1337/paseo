import { execCommand } from "./spawn.js";

/** Snapshot owned roots and their descendants before releasing a provider runtime. */
export async function snapshotProcessTree(rootPids: readonly number[]): Promise<Set<number>> {
  const roots = new Set(rootPids.filter((pid) => Number.isInteger(pid) && pid > 0));
  if (roots.size === 0) return roots;
  if (process.platform === "win32") return roots;

  const { stdout } = await execCommand("ps", ["-axo", "pid=,ppid="], {
    timeout: 2_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const children = new Map<number, number[]>();
  const alive = new Set<number>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const parent = Number(match[2]);
    alive.add(pid);
    const siblings = children.get(parent) ?? [];
    siblings.push(pid);
    children.set(parent, siblings);
  }
  const found = new Set<number>();
  const pending = [...roots].filter((pid) => alive.has(pid));
  while (pending.length > 0) {
    const pid = pending.pop()!;
    if (found.has(pid)) continue;
    found.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return found;
}

export async function countExitedProcesses(pids: ReadonlySet<number>): Promise<number> {
  if (pids.size === 0) return 0;
  if (process.platform === "win32") {
    let exited = 0;
    for (const pid of pids) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") exited += 1;
      }
    }
    return exited;
  }
  const { stdout } = await execCommand("ps", ["-axo", "pid="], {
    timeout: 2_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const alive = new Set(stdout.split("\n").map((line) => Number(line.trim())));
  return [...pids].filter((pid) => !alive.has(pid)).length;
}
