import {
  assertOwnerUnixCredentialsAvailable,
  ownerUnixListenerFd,
  closeOwnerUnixFd,
  unlinkOwnerUnixEndpoint,
} from "./owner-unix-origin.js";
import { createServer, type IncomingMessage } from "node:http";
import { fstat, type BigIntStats } from "node:fs";
import { chmod, lstat, realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { dirname, isAbsolute } from "node:path";
import type { Duplex } from "node:stream";

const statFd = promisify(fstat);

/** Owner-private, additional endpoint. Never replaces normal listeners or
 * authentication. No stale path removal; cleanup only our own socket inode. */
export async function startOwnerUnixListener(
  path: string,
  upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void,
) {
  assertOwnerUnixCredentialsAvailable();
  const uid = process.getuid?.();
  if (
    process.platform !== "darwin" ||
    uid === undefined ||
    !isAbsolute(path) ||
    path.includes("\0") ||
    Buffer.byteLength(path) > 100
  )
    throw new Error("Owner Unix endpoint unsupported");
  const parent = dirname(path),
    directory = await lstat(parent);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (await realpath(parent)) !== parent ||
    directory.uid !== uid ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error("Owner Unix directory must be canonical, owned and private");
  try {
    await lstat(path);
    throw new Error("Owner Unix endpoint already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const server = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const sockets = new Set<Duplex>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }
    upgrade(request, socket, head);
  });
  const fd = ownerUnixListenerFd(path);
  let descriptor: BigIntStats | undefined;
  let inode: BigIntStats | undefined;
  let adopted = false;
  const cleanup = async () => {
    for (const socket of sockets) socket.destroy();
    if (adopted) await new Promise<void>((resolve) => server.close(() => resolve()));
    else closeOwnerUnixFd(fd);
    // Node may have released and reused the descriptor; the native boundary
    // checks and closes without yielding. The pathname release has the same guard.
    if (adopted && descriptor) closeOwnerUnixFd(fd, descriptor);
    if (inode) unlinkOwnerUnixEndpoint(path, inode);
  };
  try {
    descriptor = await statFd(fd, { bigint: true });
    inode = await lstat(path, { bigint: true });
    await chmod(path, 0o600);
    const current = await lstat(path, { bigint: true });
    if (
      !current.isSocket() ||
      current.dev !== inode.dev ||
      current.ino !== inode.ino ||
      current.uid !== BigInt(uid) ||
      (current.mode & 0o777n) !== 0o600n
    )
      throw new Error("Owner Unix socket unsafe");
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      adopted = true;
      server.listen({ fd }, () => resolve());
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
