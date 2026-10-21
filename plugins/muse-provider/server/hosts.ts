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
  released: number;
  users: number;
  idle?: ReturnType<typeof setTimeout>;
  retired: boolean;
  closing?: Promise<void>;
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
  // Every child not yet exited, including retired generations still serving or closing.
  private readonly owned = new Set<SharedHost>();
  private waiters = new Set<() => void>();
  private closed = false;

  async use<T>(
    launch: ProviderLaunch,
    work: (host: MspConnection) => Promise<T>,
    options: { startupTimeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const stamp = await freshKey(launch);
    const shared = await this.acquire(launch, stamp, options);
    const task = this.run(shared, work);
    const signal = options.signal;
    if (!signal) return task;
    // A cancelled caller detaches; the shared host keeps serving peers and its request runs out.
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new MuseError("closed", "Muse request was cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }

  private async run<T>(shared: SharedHost, work: (host: MspConnection) => Promise<T>): Promise<T> {
    try {
      await shared.ready;
      return await work(shared.host);
    } catch (error) {
      if (shared.host.failed || !(error instanceof MuseError) || error.kind === "timeout")
        await this.discard(shared);
      throw error;
    } finally {
      this.release(shared);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.notify();
    await Promise.all([...this.owned].map((shared) => this.discard(shared)));
  }

  /** Returns a host with the caller counted as a user; waits while `maxHosts` children are alive. */
  private async acquire(
    launch: ProviderLaunch,
    stamp: string,
    options: { startupTimeoutMs?: number; signal?: AbortSignal },
  ): Promise<SharedHost> {
    const key = launchKey(launch);
    for (;;) {
      if (this.closed) throw new MuseError("closed", "Muse hosts are closed");
      options.signal?.throwIfAborted();
      const current = this.hosts.get(key);
      if (current && current.stamp === stamp && Date.now() - current.started < maxAgeMs) {
        current.users++;
        clearTimeout(current.idle);
        return current;
      }
      if (current) this.retire(current);
      if (this.owned.size < maxHosts) {
        const shared = this.start(key, launch, stamp, options.startupTimeoutMs);
        shared.users++;
        return shared;
      }
      // Free one slot at a time: only evict an idle host when nothing retired is draining.
      if (this.owned.size === this.hosts.size) {
        const idle = [...this.hosts.values()]
          .filter((shared) => shared.users === 0)
          .sort((a, b) => a.released - b.released)[0];
        if (idle) this.retire(idle);
      }
      await this.changed(options.signal);
    }
  }

  private start(
    key: string,
    launch: ProviderLaunch,
    stamp: string,
    startupTimeoutMs?: number,
  ): SharedHost {
    const host = new MspConnection({ launch, startupTimeoutMs });
    const shared: SharedHost = {
      launch: key,
      stamp,
      host,
      ready: host.initialize(),
      started: Date.now(),
      released: Date.now(),
      users: 0,
      retired: false,
    };
    shared.ready.catch(() => this.discard(shared));
    host.onExit(() => void this.discard(shared));
    this.hosts.set(key, shared);
    this.owned.add(shared);
    return shared;
  }

  private release(shared: SharedHost): void {
    shared.users--;
    shared.released = Date.now();
    this.notify();
    if (shared.users > 0) return;
    if (shared.retired) {
      void this.shut(shared);
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
    if (shared.users === 0) void this.shut(shared);
  }

  private discard(shared: SharedHost): Promise<void> {
    this.retire(shared);
    return this.shut(shared);
  }

  private shut(shared: SharedHost): Promise<void> {
    shared.closing ??= shared.host
      .close()
      .catch(() => {})
      .finally(() => {
        this.owned.delete(shared);
        this.notify();
      });
    return shared.closing;
  }

  /** Resolves on the next release or exit, when a slot may have opened. */
  private changed(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        this.waiters.delete(done);
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.waiters.add(done);
    });
  }

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = new Set();
    for (const wake of waiters) wake();
  }
}
