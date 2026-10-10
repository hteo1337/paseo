import { setTimeout as delay } from "node:timers/promises";
import { execCommand } from "./spawn.js";

/** PID and start time together prevent a late cleanup from signaling a reused PID. */
export type ProcessTreeSnapshot = Map<number, string>;

async function processTable(): Promise<Map<number, { parent: number; started: string }>> {
  const { stdout } = await execCommand("ps", ["-axo", "pid=,ppid=,lstart="], {
    timeout: 2_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const processes = new Map<number, { parent: number; started: string }>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (match) processes.set(Number(match[1]), { parent: Number(match[2]), started: match[3] });
  }
  return processes;
}

/** Snapshot owned roots and descendants before the provider can detach them. */
export async function snapshotProcessTree(
  rootPids: readonly number[],
): Promise<ProcessTreeSnapshot> {
  const roots = new Set(rootPids.filter((pid) => Number.isInteger(pid) && pid > 0));
  if (roots.size === 0) return new Map();
  if (process.platform === "win32") return new Map([...roots].map((pid) => [pid, ""]));

  const processes = await processTable();
  const children = new Map<number, number[]>();
  for (const [pid, { parent }] of processes) {
    const siblings = children.get(parent) ?? [];
    siblings.push(pid);
    children.set(parent, siblings);
  }
  const found: ProcessTreeSnapshot = new Map();
  const pending = [...roots];
  while (pending.length > 0) {
    const pid = pending.pop()!;
    const process = processes.get(pid);
    if (!process || found.has(pid)) continue;
    found.set(pid, process.started);
    pending.push(...(children.get(pid) ?? []));
  }
  return found;
}

async function survivingProcesses(snapshot: ProcessTreeSnapshot): Promise<number[]> {
  if (process.platform === "win32") {
    return [...snapshot.keys()].filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
    });
  }
  const processes = await processTable();
  return [...snapshot]
    .filter(([pid, started]) => processes.get(pid)?.started === started)
    .map(([pid]) => pid);
}

export async function countExitedProcesses(snapshot: ProcessTreeSnapshot): Promise<number> {
  return snapshot.size - (await survivingProcesses(snapshot)).length;
}

/** Verify every captured descendant is gone, even if its original parent exited first. */
export async function reapProcessTree(snapshot: ProcessTreeSnapshot): Promise<number> {
  if (snapshot.size === 0) return 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await survivingProcesses(snapshot)).length === 0) return snapshot.size;
    await delay(100);
  }
  const survivors = await survivingProcesses(snapshot);
  for (const pid of survivors) {
    // Check identity again immediately before signaling to limit PID-reuse risk.
    if (!(await survivingProcesses(new Map([[pid, snapshot.get(pid)!]]))).includes(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await survivingProcesses(snapshot)).length === 0) return snapshot.size;
    await delay(100);
  }
  throw new Error(
    `Provider process tree still has ${(await survivingProcesses(snapshot)).length} survivors after SIGKILL`,
  );
}
