import { createServer, connect, type Socket } from "node:net";
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  chmodSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertOwnerUnixCredentialsAvailable,
  bindOwnerUnixOrigin,
  kernelPeerUid,
  ownerUnixOrigin,
} from "./owner-unix-origin.js";
import {
  resolvePluginInvocation,
  consumePluginInvocation,
} from "./plugins/invocation-authority.js";
import { SessionAuthorization } from "./authorization/index.js";
import { startOwnerUnixListener } from "./owner-unix-listener.js";

const roots: string[] = [];
afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function root() {
  const p = realpathSync(mkdtempSync(join(tmpdir(), "paseo-unix-")));
  roots.push(p);
  chmodSync(p, 0o700);
  return p;
}
async function accepted(path: string | undefined) {
  const server = createServer();
  const socket = new Promise<Socket>((resolve) => server.once("connection", resolve));
  await new Promise<void>((resolve) =>
    path ? server.listen(path, resolve) : server.listen(0, "127.0.0.1", resolve),
  );
  const address = server.address();
  const client = path ? connect(path) : connect((address as { port: number }).port, "127.0.0.1");
  return { server, client, socket: await socket };
}
async function close(f: Awaited<ReturnType<typeof accepted>>) {
  f.client.destroy();
  f.socket.destroy();
  await new Promise<void>((resolve) => f.server.close(() => resolve()));
}

describe.skipIf(process.platform !== "darwin")("owner Unix request provenance", () => {
  it("uses actual kernel Unix peer UID and never marks another source in the same Session", async () => {
    const f = await accepted(join(root(), "peer.sock"));
    try {
      const local = {},
        remote = {};
      expect(kernelPeerUid(f.socket)).toBe(process.getuid!());
      bindOwnerUnixOrigin(local, f.socket, "server");
      expect(ownerUnixOrigin(local)).toEqual({
        kind: "owner-unix",
        serverId: "server",
        ownerUid: process.getuid!(),
        peerUid: process.getuid!(),
      });
      expect(ownerUnixOrigin(remote)).toBeUndefined();
      expect(ownerUnixOrigin({ kind: "owner-unix", ownerUid: process.getuid!() })).toBeUndefined();
      f.socket.destroy();
      expect(ownerUnixOrigin(local)).toBeUndefined();
    } finally {
      await close(f);
    }
  });
  it("fences same-Session mixed origins and disconnect during asynchronous authorization/consumption", async () => {
    const f = await accepted(join(root(), "peer.sock"));
    try {
      const local = {},
        remote = {};
      bindOwnerUnixOrigin(local, f.socket, "server");
      const deps = (source: object) => ({
        authorization: new SessionAuthorization(["daemon.manage", "workspace.read"]),
        authentication: {
          kind: "session" as const,
          sessionId: "11111111-1111-4111-8111-111111111111",
          clientId: "same-client",
        },
        origin: () => ownerUnixOrigin(source),
        getWorkspace: async () => ({ workspaceId: "w" }),
        getAgent: async () => null,
      });
      const a = await resolvePluginInvocation({ workspaceId: "w" }, deps(local));
      const b = await resolvePluginInvocation({ workspaceId: "w" }, deps(remote));
      expect(a!.origin!.kind).toBe("owner-unix");
      expect(b!.origin).toBeUndefined();
      let release!: (value: { workspaceId: string }) => void;
      const pending = resolvePluginInvocation(
        { workspaceId: "w" },
        {
          ...deps(local),
          getWorkspace: () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        },
      );
      f.socket.destroy();
      release({ workspaceId: "w" });
      await expect(pending).rejects.toThrow(/origin changed/);
      expect(() => consumePluginInvocation(a)).toThrow(/denied/);
    } finally {
      await close(f);
    }
  });
  it("fails closed without a supported native credential reader", () => {
    const native = createRequire(import.meta.url)("./native/peer-credentials.node"),
      original = native.peerUid;
    try {
      native.peerUid = undefined;
      expect(() => assertOwnerUnixCredentialsAvailable()).toThrow();
    } finally {
      native.peerUid = original;
    }
  });
  it("rejects actual TCP sockets including loopback", async () => {
    const f = await accepted(undefined);
    try {
      expect(() => bindOwnerUnixOrigin({}, f.socket, "server")).toThrow();
    } finally {
      await close(f);
    }
  });
  it("denies mismatched kernel peer UID without recording any evidence", async () => {
    const f = await accepted(join(root(), "peer.sock"));
    const native = createRequire(import.meta.url)("./native/peer-credentials.node");
    const original = native.peerUid;
    try {
      native.peerUid = () => process.getuid!() + 1;
      const source = {};
      expect(() => bindOwnerUnixOrigin(source, f.socket, "server")).toThrow(/denied/);
      expect(ownerUnixOrigin(source)).toBeUndefined();
    } finally {
      native.peerUid = original;
      await close(f);
    }
  });
  it("rejects NUL paths before binding and closes raw descriptors on failed adoption", async () => {
    const p = join(root(), "owner.sock");
    await expect(startOwnerUnixListener(p + "\0suffix", () => {})).rejects.toThrow(/unsupported/);
    expect(existsSync(p)).toBe(false);
    const native = createRequire(import.meta.url)("./native/peer-credentials.node");
    expect(() => native.createListener(p + "\0suffix")).toThrow(/Invalid/);
    const { Server } = await import("node:net");
    const original = native.createListener;
    let fd = -1;
    native.createListener = (path: string) => {
      fd = original(path);
      return fd;
    };
    try {
      for (const asynchronous of [false, true]) {
        const fail = vi
          .spyOn(Server.prototype, "listen")
          .mockImplementation(function (this: import("node:net").Server) {
            if (!asynchronous) throw Error("fixture adoption failed");
            queueMicrotask(this.emit.bind(this, "error", Error("fixture adoption failed")));
            return this;
          });
        try {
          await expect(startOwnerUnixListener(p, () => {})).rejects.toThrow(/adoption failed/);
          expect(() => fstatSync(fd)).toThrow();
          expect(existsSync(p)).toBe(false);
        } finally {
          fail.mockRestore();
        }
      }
    } finally {
      native.createListener = original;
    }
  });
  it("does not close a descriptor reused for a different socket after failed adoption", async () => {
    const directory = root(),
      path = join(directory, "owner.sock"),
      replacement = join(directory, "replacement.sock");
    const native = createRequire(import.meta.url)("./native/peer-credentials.node");
    const original = native.createListener;
    const { Server } = await import("node:net");
    let originalFd = -1,
      replacementFd = -1;
    native.createListener = (value: string) => {
      originalFd = original(value);
      return originalFd;
    };
    const fail = vi
      .spyOn(Server.prototype, "listen")
      .mockImplementation(function (this: import("node:net").Server) {
        closeSync(originalFd);
        replacementFd = original(replacement);
        expect(replacementFd).toBe(originalFd);
        throw Error("fixture released adoption failed");
      });
    try {
      await expect(startOwnerUnixListener(path, () => {})).rejects.toThrow(/adoption failed/);
      expect(fstatSync(replacementFd).isSocket()).toBe(true);
      expect(existsSync(replacement)).toBe(true);
      expect(existsSync(path)).toBe(false);
    } finally {
      fail.mockRestore();
      native.createListener = original;
      if (replacementFd >= 0) closeSync(replacementFd);
    }
  });
  it("refuses shared/reused endpoint paths and removes only the owned fixture", async () => {
    const p = join(root(), "owner.sock");
    writeFileSync(p, "retain");
    await expect(startOwnerUnixListener(p, () => {})).rejects.toThrow(/exists/);
    rmSync(p);
    chmodSync(join(p, ".."), 0o755);
    await expect(startOwnerUnixListener(p, () => {})).rejects.toThrow(/private/);
    chmodSync(join(p, ".."), 0o700);
    const stop = await startOwnerUnixListener(p, (_r, socket) => socket.destroy());
    await stop();
    const stopReplacement = await startOwnerUnixListener(p, (_r, socket) => socket.destroy());
    rmSync(p);
    writeFileSync(p, "replacement");
    await stopReplacement();
    expect((await import("node:fs")).readFileSync(p, "utf8")).toBe("replacement");
  });
});
