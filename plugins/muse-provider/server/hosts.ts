import type { ProviderLaunch } from "@getpaseo/plugin/server/provider";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { launchKey } from "./catalog.js";
import { MspConnection } from "./connection.js";
import { MuseError } from "./errors.js";

// Longer than the daemon's 5-minute status and usage caches, so routine polls find a warm host.
const idleMs = 600000;
const maxAgeMs = 1800000;
const maxHosts = 8;

interface SharedHost {
  launch: string;
  stamp: string;
  host: MspConnection;
  ready: Promise<void>;
  started: number;
  users: number;
  idle?: ReturnType<typeof setTimeout>;
  retired: boolean;
}

/** Identifies a launch plus the installed Muse build and login, so upgrades and `muse login` miss caches. */
export async function freshKey(launch: ProviderLaunch): Promise<string> {
  const configHome =
    launch.env.XDG_CONFIG_HOME ?? path.join(launch.env.HOME ?? homedir(), ".config");
  // The launcher script stays put on upgrade; `.muse-version` beside it names the active binary.
  const files = [
    launch.command,
    path.join(path.dirname(launch.command), ".muse-version"),
    path.join(configHome, "muse", "auth.json"),
  ];
  const stamps = await Promise.all(
    files.map(async (file) => {
      try {
        const info = await stat(file);
        return `${info.ino}:${info.size}:${info.mtimeMs}`;
      } catch {
        return "missing";
      }
    }),
  );
  return createHash("sha256")
    .update(JSON.stringify([launchKey(launch), stamps]))
    .digest("hex");
}

/** Shares one maintenance `muse serve` per launch; every start writes a bootstrap log. */
export class Hosts {
  private readonly hosts = new Map<string, SharedHost>();
  private closed = false;

  async use<T>(
    launch: ProviderLaunch,
    work: (host: MspConnection) => Promise<T>,
    options: { startupTimeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const stamp = await freshKey(launch);
    if (this.closed) throw new MuseError("closed", "Muse hosts are closed");
    options.signal?.throwIfAborted();
    const shared = this.acquire(launch, stamp, options.startupTimeoutMs);
    shared.users++;
    clearTimeout(shared.idle);
    // A cancelled caller cannot withdraw an MSP request, so the host it was using is discarded.
    const cancel = () => void this.discard(shared);
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      await shared.ready;
      return await work(shared.host);
    } catch (error) {
      if (shared.host.failed || !(error instanceof MuseError) || error.kind === "timeout")
        await this.discard(shared);
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      this.release(shared);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.hosts.values()].map((shared) => this.discard(shared)));
  }

  private acquire(launch: ProviderLaunch, stamp: string, startupTimeoutMs?: number): SharedHost {
    const key = launchKey(launch);
    const current = this.hosts.get(key);
    if (current && current.stamp === stamp && Date.now() - current.started < maxAgeMs)
      return current;
    if (current) this.retire(current);
    for (const shared of this.hosts.values()) {
      if (this.hosts.size < maxHosts) break;
      if (shared.users === 0) this.retire(shared);
    }
    const host = new MspConnection({ launch, startupTimeoutMs });
    const shared: SharedHost = {
      launch: key,
      stamp,
      host,
      ready: host.initialize(),
      started: Date.now(),
      users: 0,
      retired: false,
    };
    shared.ready.catch(() => this.discard(shared));
    host.onExit(() => void this.discard(shared));
    this.hosts.set(key, shared);
    return shared;
  }

  private release(shared: SharedHost): void {
    shared.users--;
    if (shared.users > 0) return;
    if (shared.retired) {
      void shared.host.close().catch(() => {});
      return;
    }
    shared.idle = setTimeout(() => this.retire(shared), idleMs);
    shared.idle.unref();
  }

  /** Stops handing out the host and closes it once current users finish. */
  private retire(shared: SharedHost): void {
    if (this.hosts.get(shared.launch) === shared) this.hosts.delete(shared.launch);
    shared.retired = true;
    clearTimeout(shared.idle);
    if (shared.users === 0) void shared.host.close().catch(() => {});
  }

  private discard(shared: SharedHost): Promise<void> {
    this.retire(shared);
    return shared.host.close().catch(() => {});
  }
}
